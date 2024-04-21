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

    socket.on('fetchMessages', async (webId) => {
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

        socket.emit('newMessage', { webId, messages: result });
    });

    socket.on('sendMessage', async (data) => {
        try {
            await firestore.collection('chat').doc(data.webId).collection('messages').add({
                ...data,
                webID: data.webId,
                visitorId: data.visitorId,
                visitorName: data.visitorName,
            });

            io.emit('newMessage', { webId: data.webId, message: [data] });
        } catch (error) {
            console.error('Error adding document: ', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');

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


        io.emit('newMessage', { webId: webID, message: [data] });
        io.emit('dataUpdateByVisitorId', { webId: queryWebId, visitorId: queryVisitorId, messages: messageData });

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