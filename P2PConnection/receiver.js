// Create peer with auto-generated ID
const peer = new Peer();

peer.on('open', (id) => {
    console.log("My peer ID:", id);
    document.getElementById('peer-id').textContent = `Your Peer ID: ${id}`;
    // Share this ID with the sender
});

peer.on('connection', (conn) => {
    console.log("Connected from:", conn.peer);

    conn.on('data', (data) => {
        console.log("Received:", data);
        document.getElementById('received-data').textContent = `Received: ${data}`;
    });

    conn.on('open', () => {
        conn.send("Hello from receiver!");
    });
});