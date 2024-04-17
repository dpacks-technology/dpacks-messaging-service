const express = require('express');
const admin = require('firebase-admin');
const serviceAccount = require('./key/chat-app-348dd-26cf9d7a4839.json');
const socketio = require('socket.io');
const cors = require('cors');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();
const app = express();
const server = require('http').createServer(app);
const io = socketio(server);
const port = 4006;

app.use(cors());
app.use(express.json());

io.on('connection', (socket) => {
    console.log('Client connected');

    const unsubscribe = firestore
        .collection('chat')
        .onSnapshot((snapshot) => {
            let data = [];
            snapshot.forEach((doc) => {
                data.push(doc.data());
            });

            const queryWebId = socket.handshake.query.webId;
            const queryVisitorId = socket.handshake.query.visitorId;

            if (queryWebId) {
                data = data.map((item) => ({
                    ...item,
                    webId: queryWebId,
                    visitorId: queryVisitorId,
                    visitorName: socket.handshake.query.visitorName,
                }));


                io.emit('dataUpdate', { webId: queryWebId, messages: data });

            }
        });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        unsubscribe();
    });
});

app.post('/insertData', async (req, res) => {
    try {
        const data = req.body;
        const webID = req.query.webId;

        if (!webID) {
            console.error('Error: webID is missing or empty');
            return res.status(400).send('Error: webID is missing or empty');
        }

        await firestore.collection('chat').doc(webID).collection('messages').add({
            ...data,
            webID,
            visitorId: data.visitorId,
            visitorName: data.visitorName,
        });

        const queryWebId = webID;
        const queryVisitorId = data.visitorId;

        const messages = await firestore
            .collection('chat')
            .doc(webID)
            .collection('messages')
            .where('visitorId', '==', data.visitorId)
            .get();

        const messageData = messages.docs.map((doc) => doc.data());

        io.emit('dataUpdate', { webId: queryWebId, messages: messageData });

        res.send('Data inserted successfully');
    } catch (error) {
        console.error('Error adding document: ', error);
        res.status(500).send('Error inserting data');
    }
});

app.get('/getMessagesByWebId', async (req, res) => {
    try {
        const webId = req.query.webId;

        if (!webId) {
            console.error('Error: webId is missing or empty');
            return res.status(400).send('Error: webId is missing or empty');
        }

        const messages = await firestore
            .collection('chat')
            .doc(webId)
            .collection('messages')
            .get();

        const groupedMessages = messages.docs.reduce((groups, message) => {
            const data = message.data();
            if (!groups[data.visitorId]) {
                groups[data.visitorId] = [];
            }
            groups[data.visitorId].push(data);
            return groups;
        }, {});

        const result = Object.entries(groupedMessages).map(([visitorId, messages]) => ({
            visitorId,
            visitorName: messages[0].visitorName,
            messages,
        }));

        res.send(result);
    } catch (error) {
        console.error('Error fetching messages: ', error);
        res.status(500).send('Error retrieving messages');
    }
});
app.get('/getMessagesByVisitorId', async (req, res) => {
    try {
        const { webId, visitorId } = req.query;

        if (!webId || !visitorId) {
            console.error('Error: webId or visitorId is missing or empty');
            return res.status(400).send('Error: webId or visitorId is missing or empty');
        }

        const messages = await firestore
            .collection('chat')
            .doc(webId)
            .collection('messages')
            .where('visitorId', '==', visitorId)
            .get();

        const messageData = messages.docs.map((doc) => doc.data());
        res.send(messageData);
    } catch (error) {
        console.error('Error fetching messages: ', error);
        res.status(500).send('Error retrieving messages');
    }
});

server.listen(port, () => {
    console.log(`app listening on port ${port}`);
});
app.get('/getLastMessage', async (req, res) => {
    try {
        const { webId, visitorId } = req.query;

        if (!webId || !visitorId) {
            console.error('Error: webId or visitorId is missing or empty');
            return res.status(400).send('Error: webId or visitorId is missing or empty');
        }

        const messagesQuery = firestore
            .collection('chat')
            .doc(webId)
            .collection('messages')
            .where('visitorId', '==', visitorId)
            .orderBy('time', 'desc')
            .limit(1);

        const messagesDoc = await messagesQuery.get();

        if (messagesDoc.empty) {
            return res.status(200).send(null);
        }

        const messageData = messagesDoc.docs[0].data();
        io.emit('dataUpdate', { webId: webId, messages: messageData });
        res.send(messageData);
    } catch (error) {
        console.error('Error fetching last message: ', error);
        res.status(500).send('Error retrieving last message');
    }
});