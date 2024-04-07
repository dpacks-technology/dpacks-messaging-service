const express = require('express');
const admin = require('firebase-admin');
const serviceAccount = require('./key/chat-app-348dd-26cf9d7a4839.json');
const socketio = require('socket.io');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();

const app = express();
const port = 4004;

const server = app.listen(port, () => {
    console.log(`app listening on port ${port}`);
});

const io = socketio(server);

io.on('connection', (socket) => {
    console.log('Client connected');
     // Emit initial data when client connects
     firestore.collection('chat').onSnapshot(snapshot => {
         const data = [];
         snapshot.forEach(doc => {
             data.push(doc.data());
         });
         socket.emit('initialData', data);
    });

     // Listen for data changes in Firestore and emit updates to connected clients
     firestore.collection('chat').onSnapshot(snapshot => {
         const data = [];
       snapshot.forEach(doc => {
         data.push(doc.data());
       });
       io.emit('dataUpdate', data);
  });

    socket.on('disconnect', () => {
         console.log('Client disconnected');
     });
 });

app.use(express.json()); // Parse JSON request bodies

// Insert data route
app.post('/insertData', async (req, res) => {
    try {
        // Data from the POST request body
        const data = req.body;

        // Retrieve the webID from the request body
        const webID = data.webID; // Assuming webID is included in the request

        // Create a reference to the messages collection within the specific webID document
        const messagesRef = firestore.collection('chat').doc(webID).collection('messages');

        // Add the message data to the messages collection
        await messagesRef.add(data);

        // Emit the updated data to connected clients, providing the webID for filtering
        io.emit('dataUpdate', { webID, messages: [data] });

        res.send('Data inserted successfully');
    } catch (error) {
        console.error('Error adding document: ', error);
        res.status(500).send('Error inserting data');
    }
});
// Read data route (Not needed anymore)