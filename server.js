const express = require('express');
const admin = require('firebase-admin');
const serviceAccount = require('./key/chat-app-348dd-26cf9d7a4839.json');
const cors = require('cors');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();
const app = express();
const server = require('http').createServer(app);
const port = 4006;
const io = require('socket.io')(server);

app.use(cors());
app.use(express.json());

app.post('/insertData', async (req, res) => {
    try {
        const data = req.body;
        const webID = req.query.webId;
        console.log("insert")

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


        const messages = await firestore
            .collection('chat')
            .doc(webID)
            .collection('messages')
            .where('visitorId', '==', data.visitorId)
            .get();

        const messageData = messages.docs.map((doc) => doc.data());

        io.emit('newMessage', messageData[0]);

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
            .orderBy('time', 'desc')
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

        // Server-side validation
        if (!webId || !visitorId) {
            console.error('Error: webId or visitorId is missing or empty');
            return res.status(400).send('Error: webId or visitorId is missing or empty');
        }

        const messages = await firestore
            .collection('chat')
            .doc(webId)
            .collection('messages')
            .where('visitorId', '==', visitorId)
            .orderBy('time', 'desc')
            .get();

        const messageData = messages.docs.map((doc) => doc.data());
        res.send(messageData);
    } catch (error) {
        console.error('Error fetching messages: ', error);
        res.status(500).send('Error retrieving messages');
    }
});


app.get('/getLastMessage', async (req, res) => {
    try {
        const { webId, visitorId } = req.query;

        const messageDoc = await firestore
            .collection('chat')
            .doc(webId)
            .collection('messages')
            .where('visitorId', '==', visitorId)
            .orderBy('time', 'desc')
            .limit(1)
            .get();

        if (messageDoc.empty) {
            return res.status(200).send(null);
        }

        const messageData = messageDoc.docs[0].data();
        res.send(messageData);
    } catch (error) {
        console.error('Error fetching last message: ', error);
        res.status(500).send('Error retrieving last message');
    }
});


server.listen(port, () => {
    console.log(`app listening on port ${port}`);
});