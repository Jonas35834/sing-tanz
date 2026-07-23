// FIREBASE KONFIGURATION (Hier eigene Daten einfügen)
const firebaseConfig = {
    apiKey: "AIzaSyDO8HC7Q3zW8HiiEMIzJvMR5kzRSOEurW8",
    authDomain: "sing-tanz.firebaseapp.com",
    projectId: "sing-tanz",
    storageBucket: "sing-tanz.firebasestorage.app",
    messagingSenderId: "123456789",
    appId: "160340825018"
};

firebase.initializeApp(firebaseConfig);
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
const db = firebase.firestore();
const auth = firebase.auth();

// Status-Variablen
let currentLayout = [];
let bookedSeats = [];
let selectedSeats = [];
let posSelectedSeats = [];

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

// Event-Einstellungen laden (Titel, Datum, Ort, Preis)
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

    // Formular-Felder im Admin ausfüllen
    document.getElementById('edit-title').value = eventConfig.title;
    document.getElementById('edit-date').value = eventConfig.date;
    document.getElementById('edit-time').value = eventConfig.time;
    document.getElementById('edit-location').value = eventConfig.location;
    document.getElementById('edit-price').value = eventConfig.price;
}

// Einstellungen im Admin speichern
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
        alert("Veranstaltungs-Details wurden erfolgreich aktualisiert!");
    } catch (err) {
        alert("Fehler beim Speichern: " + err.message);
    }
});

// Saalplan und Buchungen aus Firestore synchronisieren
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

    db.collection('bookings').onSnapshot(snapshot => {
        bookedSeats = [];
        const bookingsTableBody = document.querySelector('#bookings-table tbody');
        bookingsTableBody.innerHTML = '';

        snapshot.forEach(doc => {
            const data = doc.data();
            bookedSeats.push(...data.seats);

            // Tabelle im Admin mit Storno-Button aufbauen
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${doc.id}</td>
                <td>${data.name}</td>
                <td>${data.email || 'Barzahlung (Kasse)'}</td>
                <td>${data.seats.join(', ')}</td>
                <td>${data.totalPrice} €</td>
                <td>
                    <button class="btn-danger" onclick="cancelBooking('${doc.id}')">Stornieren</button>
                </td>
            `;
            bookingsTableBody.appendChild(tr);
        });
        renderUserSeating();
        renderPosSeating();
    });
}

// Stornierung durch den Admin
async function cancelBooking(ticketId) {
    if (confirm(`Möchtest du das Ticket ${ticketId} wirklich stornieren? Die Plätze werden sofort wieder frei.`)) {
        try {
            await db.collection('bookings').doc(ticketId).delete();
            alert("Buchung erfolgreich storniert!");
        } catch (err) {
            alert("Fehler bei der Stornierung: " + err.message);
        }
    }
}

// Interaktiver Besucher-Saalplan
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

// Reguläre Online-Buchung durch den Besucher
document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('buyer-name').value;
    const email = document.getElementById('buyer-email').value;
    const ticketId = 'TICK-' + Math.floor(100000 + Math.random() * 900000);
    const totalPrice = (selectedSeats.length * eventConfig.price).toFixed(2);

    try {
        await db.collection('bookings').doc(ticketId).set({
            name: name,
            email: email,
            seats: selectedSeats,
            totalPrice: totalPrice,
            createdAt: new Date().toISOString()
        });

        generatePDFTicket(ticketId, name, selectedSeats, totalPrice);
        alert("Buchung erfolgreich! Dein PDF-Ticket wird heruntergeladen.");
        selectedSeats = [];
        document.getElementById('booking-form-container').classList.add('hidden');
        renderUserSeating();

    } catch (err) {
        alert("Fehler bei der Buchung: " + err.message);
    }
});

// --- KASSEN-MODUS (POS) ---

document.getElementById('toggle-pos-btn').onclick = () => {
    const posBox = document.getElementById('pos-mode-container');
    posBox.classList.toggle('hidden');
    renderPosSeating();
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
                seatDiv.onclick = () => togglePosSeatSelection(seat.id);
            }
            rowDiv.appendChild(seatDiv);
        });
        el.appendChild(rowDiv);
    });
}

function togglePosSeatSelection(seatId) {
    if (posSelectedSeats.includes(seatId)) {
        posSelectedSeats = posSelectedSeats.filter(id => id !== seatId);
    } else {
        posSelectedSeats.push(seatId);
    }

    document.getElementById('pos-seats-list').innerText = posSelectedSeats.length > 0 ? posSelectedSeats.join(', ') : '-';
    document.getElementById('pos-total-price').innerText = (posSelectedSeats.length * eventConfig.price).toFixed(2);
    renderPosSeating();
}

// Kassen-Verkauf abschließen
document.getElementById('pos-submit-btn').onclick = async () => {
    if (posSelectedSeats.length === 0) {
        alert("Bitte wähle mindestens einen Sitzplatz im Kassenplan aus!");
        return;
    }
    const name = document.getElementById('pos-buyer-name').value || "Barzahler Abendkasse";
    const ticketId = 'POS-' + Math.floor(100000 + Math.random() * 900000);
    const totalPrice = (posSelectedSeats.length * eventConfig.price).toFixed(2);

    try {
        await db.collection('bookings').doc(ticketId).set({
            name: name,
            email: "Barverkauf vor Ort",
            seats: posSelectedSeats,
            totalPrice: totalPrice,
            createdAt: new Date().toISOString()
        });

        generatePDFTicket(ticketId, name, posSelectedSeats, totalPrice);
        alert("Barverkauf abgeschlossen! PDF-Ticket erstellt.");
        posSelectedSeats = [];
        document.getElementById('pos-buyer-name').value = '';
        document.getElementById('pos-seats-list').innerText = '-';
        document.getElementById('pos-total-price').innerText = '0.00';
        renderPosSeating();

    } catch (err) {
        alert("Fehler bei Kassenbuchung: " + err.message);
    }
};

// PDF Ticket Erzeugung
function generatePDFTicket(ticketId, name, seats, price) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text(eventConfig.title, 20, 20);

    doc.setFontSize(12);
    doc.text(`Ticket-Nummer: ${ticketId}`, 20, 35);
    doc.text(`Name: ${name}`, 20, 45);
    doc.text(`Sitzplätze: ${seats.join(', ')}`, 20, 55);
    doc.text(`Gesamtpreis: ${price} EUR`, 20, 65);
    doc.text(`Datum: ${eventConfig.date} | ${eventConfig.time}`, 20, 75);
    doc.text(`Ort: ${eventConfig.location}`, 20, 85);

    // QR-Code für Ticketkontrolle
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';
    new QRCode(qrDiv, ticketId);

    setTimeout(() => {
        const qrCanvas = qrDiv.querySelector('canvas');
        if (qrCanvas) {
            const qrDataUrl = qrCanvas.toDataURL('image/png');
            doc.addImage(qrDataUrl, 'PNG', 140, 35, 50, 50);
        }
        doc.save(`Ticket_${ticketId}.pdf`);
    }, 200);
}

// --- ADMIN & AUTH LOGIK ---

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

// Editor-Hilfsfunktionen
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
            const seatBtn = document.createElement('button');
            seatBtn.style.margin = "2px";
            seatBtn.className = seat.status === 'blocked' ? 'btn-danger' : 'btn-secondary';
            seatBtn.innerText = `${seat.id} (${seat.status === 'blocked' ? 'gesperrt' : 'frei'})`;

            seatBtn.onclick = () => {
                currentLayout[rIndex].seats[sIndex].status = 
                    currentLayout[rIndex].seats[sIndex].status === 'available' ? 'blocked' : 'available';
                renderAdminEditor();
            };

            rowDiv.appendChild(seatBtn);
        });

        const addSeatBtn = document.createElement('button');
        addSeatBtn.innerText = "+ Sitz";
        addSeatBtn.onclick = () => {
            const nextSeatNum = row.seats.length + 1;
            row.seats.push({ id: `${rIndex + 1}-${nextSeatNum}`, status: 'available' });
            renderAdminEditor();
        };
        rowDiv.appendChild(addSeatBtn);

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
        .then(() => alert("Saalplan gespeichert und aktualisiert!"))
        .catch(err => alert("Fehler beim Speichern: " + err.message));
};
