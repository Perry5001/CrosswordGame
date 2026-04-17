// Create peer with auto-generated ID
const peer = new Peer('1234');

peer.on('open', (id) => {
    console.log('Invite link: yoursite.com/join?id=' + id);
    document.getElementById('peer-id').textContent = `Your Peer ID: ${id}`;
    // Share this ID with the sender
});

peer.on('connection', (conn) => {
    console.log("Connected from:", conn.peer);

    conn.on('open', () => {
        console.log("Connection opened");
    });

    conn.on('data', (data) => {
        console.log("Received:", data);

        // Echo back (useful for testing)
        conn.send("Echo: " + data);
    });
});