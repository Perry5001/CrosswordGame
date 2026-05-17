
const log = (msg) => {
    document.getElementById("log").textContent += msg + "\n";
};

const urlParams = new URLSearchParams(window.location.search);
const hostID = urlParams.get('id');
console.log("Host ID from URL:", hostID);
const peer = new Peer();
let conn = null;

peer.on('open', (id) => {
    log("My Peer ID: " + id);
    connect()
});

const receiverId = hostID;


function connect() {
    // Prevent duplicate connections
    if (conn && conn.open) {
        log("Already connected");
        return;
    }

    log("Connecting...");

    conn = peer.connect(receiverId);

    conn.on('open', () => {
        log("✅ Connected to " + receiverId);
    });

    conn.on('data', (data) => {
        log("📩 Received: " + data);
    });

    conn.on('close', () => {
        log("❌ Connection closed");
        conn = null;
    });

    conn.on('error', (err) => {
        log("⚠️ Error: " + err);
    });

}

function sendMessage() {
    const msg = document.getElementById("message").value;

    if (!conn) {
        log("No connection object");
        return;
    }

    if (!conn.open) {
        log("Connection not open yet");
        return;
    }

    conn.send(msg);
    log("📤 Sent: " + msg);
}