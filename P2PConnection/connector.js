// Replace with ID from Computer A
const receiverId = document.getElementById('dest-id').value.trim();

const peer = new Peer();

peer.on('open', () => {
    const conn = peer.connect(receiverId);

    conn.on('open', () => {
        console.log("Connected to receiver");
        conn.send("Hello from sender!");
    });

    conn.on('data', (data) => {
        console.log("Received:", data);
    });
});