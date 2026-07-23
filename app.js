// 1. FIREBASE KONFIGURATION (Ersetze dies mit deinen Firebase-Daten)
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

// Zustand der Anwendung
let currentLayout = [];
let bookedSeats = [];
let selectedSeats = [];
const TICKET_PRICE = 12.00; // Standardpreis pro Platz in Euro

// DOM Elemente
const seatingMapEl = document.getElementById('seating-map');
const adminSeatingEditorEl = document.getElementById('admin-seating-editor');
const bookingFormContainer = document.getElementById('booking-form-container');
const selectedSeatsListEl = document.getElementById('selected-seats-list');
const totalPriceEl = document.getElementById('total-price');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadLayoutAndBookings();
});

// Realtime-Laden von Sitzplan und Buchungen aus Firestore
function loadLayoutAndBookings() {
    db.collection('config').doc('layout').onSnapshot(doc => {
        if (doc.exists) {
            currentLayout = doc.data().rows || [];
            renderUserSeating();
            if(!document.getElementById('admin-dashboard').classList.contains('hidden')) {
                renderAdminEditor();
            }
        } else {
            // Default Layout erzeugen falls leer
            currentLayout = [
                { rowName: "Reihe 1", seats: [{ id: "1-1", status: "available" }, { id: "1-2", status: "available" }, { id: "1-3", status: "available" }] },
                { rowName: "Reihe 2", seats: [{ id: "2-1", status: "available" }, { id: "2-2", status: "available" }, { id: "2-3", status: "available" }] }
            ];
            renderUserSeating();
        }
    });

    db.collection('bookings').onSnapshot(snapshot => {
        bookedSeats = [];
        const bookingsTableBody = document.querySelector('#bookings-table tbody');
        bookingsTableBody.innerHTML = '';

        snapshot.forEach(doc => {
            const data = doc.data();
            bookedSeats.push(...data.seats);

            // Admin Tabelle befüllen
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${doc.id}</td>
                <td>${data.name}</td>
                <td>${data.email}</td>
                <td>${data.seats.join(', ')}</td>
                <td>${data.totalPrice} €</td>
            `;
            bookingsTableBody.appendChild(tr);
        });
        renderUserSeating();
    });
}

// Besucher-Sitzplan rendern
function renderUserSeating() {
    seatingMapEl.innerHTML = '';
    
    currentLayout.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';
        
        row.seats.forEach(seat => {
            const seatDiv = document.createElement('div');
            seatDiv.classList.add('seat');
            
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
        seatingMapEl.appendChild(rowDiv);
    });
}

// Platz auswählen / abwählen
function toggleSeatSelection(seatId) {
    if (selectedSeats.includes(seatId)) {
        selectedSeats = selectedSeats.filter(id => id !== seatId);
    } else {
        selectedSeats.push(seatId);
    }

    if (selectedSeats.length > 0) {
        bookingFormContainer.classList.remove('hidden');
        selectedSeatsListEl.innerText = selectedSeats.join(', ');
        totalPriceEl.innerText = (selectedSeats.length * TICKET_PRICE).toFixed(2);
    } else {
        bookingFormContainer.classList.add('hidden');
    }
    renderUserSeating();
}

// Ticket buchen & PDF generieren
document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('buyer-name').value;
    const email = document.getElementById('buyer-email').value;
    const ticketId = 'TICK-' + Math.floor(100000 + Math.random() * 900000);
    const totalPrice = (selectedSeats.length * TICKET_PRICE).toFixed(2);

    try {
        // In Firestore speichern (Sperrt gebuchte Plätze automatisch)
        await db.collection('bookings').doc(ticketId).set({
            name: name,
            email: email,
            seats: selectedSeats,
            totalPrice: totalPrice,
            createdAt: new Date().toISOString()
        });

        // QR Code erzeugen
        document.getElementById('qrcode').innerHTML = '';
        new QRCode(document.getElementById('qrcode'), ticketId);

        setTimeout(() => {
            generatePDFTicket(ticketId, name, selectedSeats, totalPrice);
            alert("Buchung erfolgreich! Dein PDF-Ticket wird heruntergeladen.");
            selectedSeats = [];
            bookingFormContainer.classList.add('hidden');
            renderUserSeating();
        }, 300);

    } catch (err) {
        alert("Fehler bei der Buchung: " + err.message);
    }
});

// PDF-Ticket-Generierung clientseitig
function generatePDFTicket(ticketId, name, seats, price) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.text("Sing & Tanz Konzert - Eintrittskarte", 20, 20);

    doc.setFontSize(14);
    doc.text(`Ticket-ID: ${ticketId}`, 20, 40);
    doc.text(`Name: ${name}`, 20, 50);
    doc.text(`Plätze: ${seats.join(', ')}`, 20, 60);
    doc.text(`Gesamtpreis: ${price} €`, 20, 70);
    doc.text(`Datum: 15. November 2026, 17:00 Uhr`, 20, 80);
    doc.text(`Ort: Stadthalle Musterstadt`, 20, 90);

    // QR Code einfügen
    const qrCanvas = document.querySelector('#qrcode canvas');
    if (qrCanvas) {
        const qrDataUrl = qrCanvas.toDataURL('image/png');
        doc.addImage(qrDataUrl, 'PNG', 140, 40, 50, 50);
    }

    doc.save(`Ticket_${ticketId}.pdf`);
}

// --- ADMIN & SITZPLAN EDITOR LOGIK ---

// Admin Login Handlers
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
        })
        .catch(err => alert("Login fehlgeschlagen: " + err.message));
};

document.getElementById('logout-btn').onclick = () => {
    auth.signOut().then(() => {
        document.getElementById('admin-dashboard').classList.add('hidden');
    });
};

// Admin Saalplan bearbeiten
function renderAdminEditor() {
    adminSeatingEditorEl.innerHTML = '';
    currentLayout.forEach((row, rIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';

        const rowLabel = document.createElement('span');
        rowLabel.innerText = row.rowName + ": ";
        rowDiv.appendChild(rowLabel);

        row.seats.forEach((seat, sIndex) => {
            const seatBtn = document.createElement('button');
            seatBtn.style.margin = "2px";
            seatBtn.innerText = `${seat.id} (${seat.status})`;

            // Status per Klick umschalten: available -> blocked -> available
            seatBtn.onclick = () => {
                currentLayout[rIndex].seats[sIndex].status = 
                    currentLayout[rIndex].seats[sIndex].status === 'available' ? 'blocked' : 'available';
                renderAdminEditor();
            };

            rowDiv.appendChild(seatBtn);
        });

        // Button: Sitz zu Reihe hinzufügen
        const addSeatBtn = document.createElement('button');
        addSeatBtn.innerText = "+ Sitz";
        addSeatBtn.onclick = () => {
            const nextSeatNum = row.seats.length + 1;
            row.seats.push({ id: `${rIndex + 1}-${nextSeatNum}`, status: 'available' });
            renderAdminEditor();
        };
        rowDiv.appendChild(addSeatBtn);

        adminSeatingEditorEl.appendChild(rowDiv);
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

// Layout in Firestore speichern
document.getElementById('save-layout-btn').onclick = () => {
    db.collection('config').doc('layout').set({ rows: currentLayout })
        .then(() => alert("Saalplan wurde erfolgreich aktualisiert und veröffentlicht!"))
        .catch(err => alert("Fehler beim Speichern: " + err.message));
};
