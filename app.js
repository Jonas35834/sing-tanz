const firebaseConfig = {
    apiKey: "AIzaSyDO8HC7Q3zW8HiiEMIzJvMR5kzRSOEurW8",
    authDomain: "sing-tanz.firebaseapp.com",
    projectId: "sing-tanz",
    storageBucket: "sing-tanz.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "160340825018"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Auth-Persistenz erzwingen (verhindert Tracking-Prevention-Sperren)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

let currentLayout = [];
let bookedSeats = [];
let selectedSeats = [];
let posSelectedSeats = [];
let html5QrcodeScanner = null;

let eventConfig = {
    title: "Sing & Tanz Konzert",
    date: "15. November 2026",
    time: "17:00 Uhr",
    location: "Stadthalle Musterstadt",
    price: 12.00
};

document.addEventListener('DOMContentLoaded', () => {
    loadEventDetails();
    loadLayoutAndBookings();
});

function loadEventDetails() {
    db.collection('config').doc('details').onSnapshot(doc => {
        if (doc.exists) {
            eventConfig = doc.data();
            updateUIWithEventDetails();
        } else {
            db.collection('config').doc('details').set(eventConfig);
        }
    });
}

function updateUIWithEventDetails() {
    document.querySelectorAll('.event-title-display').forEach(el => el.innerText = eventConfig.title);
    document.getElementById('display-date').innerText = eventConfig.date;
    document.getElementById('display-time').innerText = eventConfig.time;
    document.getElementById('display-location').innerText = eventConfig.location;
    document.getElementById('display-price').innerText = parseFloat(eventConfig.price).toFixed(2);

    document.getElementById('edit-title').value = eventConfig.title;
    document.getElementById('edit-date').value = eventConfig.date;
    document.getElementById('edit-time').value = eventConfig.time;
    document.getElementById('edit-location').value = eventConfig.location;
    document.getElementById('edit-price').value = eventConfig.price;
}

document.getElementById('event-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updated = {
        title: document.getElementById('edit-title').value,
        date: document.getElementById('edit-date').value,
        time: document.getElementById('edit-time').value,
        location: document.getElementById('edit-location').value,
        price: parseFloat(document.getElementById('edit-price').value)
    };

    try {
        await db.collection('config').doc('details').set(updated);
        alert("Veranstaltungs-Details aktualisiert!");
    } catch (err) {
        alert("Fehler: " + err.message);
    }
});

function loadLayoutAndBookings() {
    db.collection('config').doc('layout').onSnapshot(doc => {
        if (doc.exists) {
            currentLayout = doc.data().rows || [];
            renderUserSeating();
            if (!document.getElementById('admin-dashboard').classList.contains('hidden')) {
                renderAdminEditor();
                renderPosSeating();
            }
        }
    });

    db.collection('tickets').onSnapshot(snapshot => {
        bookedSeats = [];
        const bookingsTableBody = document.querySelector('#bookings-table tbody');
        bookingsTableBody.innerHTML = '';

        snapshot.forEach(doc => {
            const data = doc.data();
            bookedSeats.push(data.seat);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${doc.id}</td>
                <td>${data.name}</td>
                <td>${data.seat}</td>
                <td><strong>${data.status || 'GÜLTIG'}</strong></td>
                <td>${data.price} €</td>
                <td>
                    <button class="btn-danger" onclick="cancelTicket('${doc.id}')">Stornieren</button>
                </td>
            `;
            bookingsTableBody.appendChild(tr);
        });
        renderUserSeating();
        renderPosSeating();
    });
}

async function cancelTicket(ticketId) {
    if (confirm(`Möchtest du das Ticket ${ticketId} wirklich stornieren?`)) {
        try {
            await db.collection('tickets').doc(ticketId).delete();
            alert("Ticket storniert!");
        } catch (err) {
            alert("Fehler: " + err.message);
        }
    }
}

// Besucher Saalplan
function renderUserSeating() {
    const el = document.getElementById('seating-map');
    el.innerHTML = '';
    
    currentLayout.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';
        
        row.seats.forEach(seat => {
            const seatDiv = document.createElement('div');
            seatDiv.className = 'seat';
            
            const isBooked = bookedSeats.includes(seat.id);
            const isSelected = selectedSeats.includes(seat.id);

            if (seat.status === 'blocked') {
                seatDiv.classList.add('blocked');
                seatDiv.innerText = 'X';
            } else if (isBooked) {
                seatDiv.classList.add('booked');
                seatDiv.innerText = seat.id;
            } else if (isSelected) {
                seatDiv.classList.add('selected');
                seatDiv.innerText = seat.id;
            } else {
                seatDiv.classList.add('available');
                seatDiv.innerText = seat.id;
                seatDiv.onclick = () => toggleSeatSelection(seat.id);
            }
            rowDiv.appendChild(seatDiv);
        });
        el.appendChild(rowDiv);
    });
}

function toggleSeatSelection(seatId) {
    if (selectedSeats.includes(seatId)) {
        selectedSeats = selectedSeats.filter(id => id !== seatId);
    } else {
        selectedSeats.push(seatId);
    }

    if (selectedSeats.length > 0) {
        document.getElementById('booking-form-container').classList.remove('hidden');
        document.getElementById('selected-seats-list').innerText = selectedSeats.join(', ');
        document.getElementById('total-price').innerText = (selectedSeats.length * eventConfig.price).toFixed(2);
    } else {
        document.getElementById('booking-form-container').classList.add('hidden');
    }
    renderUserSeating();
}

// Online Buchung: Erstellt pro Sitzplatz eine eigene Karte/Ticket
document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('buyer-name').value;
    const email = document.getElementById('buyer-email').value;

    try {
        for (const seat of selectedSeats) {
            const ticketId = 'TICK-' + Math.floor(100000 + Math.random() * 900000);
            await db.collection('tickets').doc(ticketId).set({
                name: name,
                email: email,
                seat: seat,
                price: eventConfig.price.toFixed(2),
                status: 'GÜLTIG',
                createdAt: new Date().toISOString()
            });
            generatePDFTicket(ticketId, name, seat, eventConfig.price.toFixed(2));
        }

        alert("Buchung erfolgreich! Alle Einzeltickets werden heruntergeladen.");
        selectedSeats = [];
        document.getElementById('booking-form-container').classList.add('hidden');
        renderUserSeating();

    } catch (err) {
        alert("Fehler bei Buchung: " + err.message);
    }
});

// Kassenverkauf vor Ort: Einzeltickets
document.getElementById('pos-submit-btn').onclick = async () => {
    if (posSelectedSeats.length === 0) {
        alert("Wähle mindestens einen Platz aus!");
        return;
    }
    const name = document.getElementById('pos-buyer-name').value || "Barzahler Abendkasse";

    try {
        for (const seat of posSelectedSeats) {
            const ticketId = 'POS-' + Math.floor(100000 + Math.random() * 900000);
            await db.collection('tickets').doc(ticketId).set({
                name: name,
                email: "Barverkauf vor Ort",
                seat: seat,
                price: eventConfig.price.toFixed(2),
                status: 'GÜLTIG',
                createdAt: new Date().toISOString()
            });
            generatePDFTicket(ticketId, name, seat, eventConfig.price.toFixed(2));
        }

        alert("Barverkauf abgeschlossen! Tickets erstellt.");
        posSelectedSeats = [];
        document.getElementById('pos-buyer-name').value = '';
        document.getElementById('pos-seats-list').innerText = '-';
        document.getElementById('pos-total-price').innerText = '0.00';
        renderPosSeating();

    } catch (err) {
        alert("Fehler: " + err.message);
    }
};

// Generiert ein PDF pro Ticket (mit individuellem QR-Code)
function generatePDFTicket(ticketId, name, seat, price) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text(eventConfig.title, 20, 20);

    doc.setFontSize(12);
    doc.text(`Ticket-ID: ${ticketId}`, 20, 35);
    doc.text(`Name: ${name}`, 20, 45);
    doc.text(`Sitzplatz: ${seat}`, 20, 55);
    doc.text(`Preis: ${price} EUR`, 20, 65);
    doc.text(`Datum: ${eventConfig.date} | ${eventConfig.time}`, 20, 75);
    doc.text(`Ort: ${eventConfig.location}`, 20, 85);

    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';
    new QRCode(qrDiv, ticketId);

    setTimeout(() => {
        const qrCanvas = qrDiv.querySelector('canvas');
        if (qrCanvas) {
            const qrDataUrl = qrCanvas.toDataURL('image/png');
            doc.addImage(qrDataUrl, 'PNG', 130, 35, 60, 60);
        }
        doc.save(`Ticket_${seat}_${ticketId}.pdf`);
    }, 200);
}

// --- SCANNER & EINLASS-KONTROLLE ---

document.getElementById('check-ticket-btn').onclick = () => {
    const id = document.getElementById('manual-ticket-id').value.trim();
    if (id) processTicketScan(id);
};

async function processTicketScan(ticketId) {
    const resultEl = document.getElementById('scan-result');
    resultEl.classList.remove('hidden', 'valid', 'invalid');

    try {
        const docRef = db.collection('tickets').doc(ticketId);
        const doc = await docRef.get();

        if (!doc.exists) {
            resultEl.classList.add('invalid');
            resultEl.innerText = `❌ UNGÜLTIG: Ticket ${ticketId} existiert nicht!`;
            return;
        }

        const data = doc.data();
        if (data.status === 'ENTWERTET') {
            resultEl.classList.add('invalid');
            resultEl.innerText = `⚠️ BEREITS ENTWERTET: Dieses Ticket (${data.seat}) wurde bereits genutzt!`;
        } else {
            await docRef.update({ status: 'ENTWERTET' });
            resultEl.classList.add('valid');
            resultEl.innerText = `✅ GÜLTIG! Einlass gewährt für ${data.name} (Platz: ${data.seat})`;
        }

    } catch (err) {
        resultEl.classList.add('invalid');
        resultEl.innerText = "Fehler beim Scannen: " + err.message;
    }
}

function startQRScanner() {
    if (html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render((decodedText) => {
        processTicketScan(decodedText);
    });
}

// --- ADMIN SAALPLAN EDITOR MIT LÖSCHFUNKTION ---

function renderAdminEditor() {
    const el = document.getElementById('admin-seating-editor');
    if (!el) return;
    el.innerHTML = '';

    currentLayout.forEach((row, rIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';

        const rowLabel = document.createElement('strong');
        rowLabel.innerText = row.rowName + ": ";
        rowDiv.appendChild(rowLabel);

        row.seats.forEach((seat, sIndex) => {
            const seatBox = document.createElement('div');
            seatBox.className = 'seat-edit-box';

            const seatBtn = document.createElement('button');
            seatBtn.className = seat.status === 'blocked' ? 'btn-danger' : 'btn-secondary';
            seatBtn.innerText = `${seat.id} (${seat.status === 'blocked' ? 'gesperrt' : 'frei'})`;

            seatBtn.onclick = () => {
                currentLayout[rIndex].seats[sIndex].status = 
                    currentLayout[rIndex].seats[sIndex].status === 'available' ? 'blocked' : 'available';
                renderAdminEditor();
            };

            // LÖSCH-BUTTON: Entfernt den Sitz komplett aus der Reihe
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete-seat';
            deleteBtn.innerText = 'X';
            deleteBtn.title = 'Sitz löschen';
            deleteBtn.onclick = () => {
                currentLayout[rIndex].seats.splice(sIndex, 1);
                renderAdminEditor();
            };

            seatBox.appendChild(seatBtn);
            seatBox.appendChild(deleteBtn);
            rowDiv.appendChild(seatBox);
        });

        const addSeatBtn = document.createElement('button');
        addSeatBtn.innerText = "+ Sitz";
        addSeatBtn.onclick = () => {
            const nextSeatNum = row.seats.length + 1;
            row.seats.push({ id: `${rIndex + 1}-${nextSeatNum}`, status: 'available' });
            renderAdminEditor();
        };
        rowDiv.appendChild(addSeatBtn);

        // Reihe löschen
        const deleteRowBtn = document.createElement('button');
        deleteRowBtn.className = 'btn-danger';
        deleteRowBtn.style.marginLeft = '10px';
        deleteRowBtn.innerText = "Reihe löschen";
        deleteRowBtn.onclick = () => {
            currentLayout.splice(rIndex, 1);
            renderAdminEditor();
        };
        rowDiv.appendChild(deleteRowBtn);

        el.appendChild(rowDiv);
    });
}

document.getElementById('add-row-btn').onclick = () => {
    const newRowIndex = currentLayout.length + 1;
    currentLayout.push({
        rowName: `Reihe ${newRowIndex}`,
        seats: [{ id: `${newRowIndex}-1`, status: "available" }]
    });
    renderAdminEditor();
};

document.getElementById('save-layout-btn').onclick = () => {
    db.collection('config').doc('layout').set({ rows: currentLayout })
        .then(() => alert("Saalplan gespeichert!"))
        .catch(err => alert("Fehler beim Speichern: " + err.message));
};

// Toggle Kassen & Scanner Modus
document.getElementById('toggle-pos-btn').onclick = () => {
    const posBox = document.getElementById('pos-mode-container');
    posBox.classList.toggle('hidden');
    if (!posBox.classList.contains('hidden')) {
        renderPosSeating();
        startQRScanner();
    }
};

function renderPosSeating() {
    const el = document.getElementById('pos-seating-map');
    if (!el) return;
    el.innerHTML = '';
    
    currentLayout.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';
        
        row.seats.forEach(seat => {
            const seatDiv = document.createElement('div');
            seatDiv.className = 'seat';
            
            const isBooked = bookedSeats.includes(seat.id);
            const isSelected = posSelectedSeats.includes(seat.id);

            if (seat.status === 'blocked') {
                seatDiv.classList.add('blocked');
                seatDiv.innerText = 'X';
            } else if (isBooked) {
                seatDiv.classList.add('booked');
                seatDiv.innerText = seat.id;
            } else if (isSelected) {
                seatDiv.classList.add('selected');
                seatDiv.innerText = seat.id;
            } else {
                seatDiv.classList.add('available');
                seatDiv.innerText = seat.id;
                seatDiv.onclick = () => {
                    if (posSelectedSeats.includes(seat.id)) {
                        posSelectedSeats = posSelectedSeats.filter(id => id !== seat.id);
                    } else {
                        posSelectedSeats.push(seat.id);
                    }
                    document.getElementById('pos-seats-list').innerText = posSelectedSeats.length > 0 ? posSelectedSeats.join(', ') : '-';
                    document.getElementById('pos-total-price').innerText = (posSelectedSeats.length * eventConfig.price).toFixed(2);
                    renderPosSeating();
                };
            }
            rowDiv.appendChild(seatDiv);
        });
        el.appendChild(rowDiv);
    });
}

// Auth Logik
document.getElementById('admin-login-btn').onclick = () => document.getElementById('login-modal').classList.remove('hidden');
document.getElementById('close-login-btn').onclick = () => document.getElementById('login-modal').classList.add('hidden');

document.getElementById('do-login-btn').onclick = () => {
    const email = document.getElementById('admin-email').value;
    const pass = document.getElementById('admin-password').value;

    auth.signInWithEmailAndPassword(email, pass)
        .then(() => {
            document.getElementById('login-modal').classList.add('hidden');
            document.getElementById('admin-dashboard').classList.remove('hidden');
            renderAdminEditor();
            renderPosSeating();
        })
        .catch(err => alert("Login fehlgeschlagen: " + err.message));
};

document.getElementById('logout-btn').onclick = () => {
    auth.signOut().then(() => {
        document.getElementById('admin-dashboard').classList.add('hidden');
    });
};
