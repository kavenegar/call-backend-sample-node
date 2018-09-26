var bodyParser = require('body-parser');
let createError = require('http-errors');
let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let logger = require('morgan');
const commandLineArgs = require('command-line-args');

let app = express();
let router = express.Router();
// Database ========================================
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({users: []}).write();
// =================================================

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended: true}));

app.use(function (req, res, next) {
    var send = res.send;
    res.send = function (body) {
        console.log(req.method, req.url, "\r\nRequest => ", JSON.stringify(req.body, undefined, 4), "\r\nResponse => ", body, "\r\n=========================================================================");
        send.call(this, body);
    };
    next()

});
// ============================================================ //
const optionDefinitions = [
    {name: 'kavenegarApiToken', type: String, defaultValue: null},
    {name: 'apnCertificateFile', type: String, defaultValue: null},
    {name: 'apnCertificatePassword', type: String, defaultValue: null},
    {name: 'firebaseProjectFile', type: String, defaultValue: null},
    {name: 'firebaseDatabaseURL', type: String, defaultValue: null}
];

const config = commandLineArgs(optionDefinitions);

// ============================================================ //

let axios = require('axios');
const httpClient = axios.create({
    baseURL: 'https://api.kavenegar.io/user/v1/',
    timeout: 10000,
    headers: {'Authorization': config.kavenegarApiToken}
});

// Firebase Messaging Config =============================================================== //

const firebaseAdmin = require('firebase-admin');
if (config.firebaseProjectFile) {
    firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(require('./' + config.firebaseProjectFile)),
        databaseURL: config.firebaseDatabaseURL
    });
}

// Apple Messaging Config =============================================================== //

const apn = require('apn');
var appleApnProvider = null;
if (config.apnCertificateFile) {
    appleApnProvider = new apn.Provider({
        pfx: config.apnCertificateFile,
        passphrase: config.apnCertificatePassword,
        production: false
    });
}

// ===========================================================//
app.get('/', function (req, res) {
    const payload = {"users": db.get("users").value()};
    console.log("index payload", payload);
    res.render('index', payload);
});

app.post("/calls", function (req, res) {

    var deviceId = req.header("authorization");

    var caller = db.get("users").find({deviceId: deviceId}).value();
    var receptor = db.get("users").find({username: req.body.receptor}).value();

    if (caller == null || receptor == null) {
        res.status(500).send({status: "invalid_caller_or_receptor"});
        return;
    }

    const payload = {
        caller: {
            username: caller.username,
            displayName: caller.displayName,
            platform: caller.platform
        },
        receptor: {
            username: receptor.username,
            displayName: receptor.displayName,
            platform: receptor.platform
        }
    };

    httpClient.post("calls", payload).then(function (response) {

        const data = response.data;
        console.log("Response of kavenegar :", data);
        const notificationToken = receptor.notificationToken;
        sendNotification(data.receptor.username, notificationToken, {
            callId: data.id,
            accessToken: data.receptor.accessToken
        }, receptor.platform);

        res.send({
            callId: data.id,
            accessToken: data.caller.accessToken
        });
    }).catch(reason => {
        if (reason.response) {
            res.status(500).send(reason.response.data);
        }
        else {
            res.status(500).send({status: reason.toString()});
        }
    });


});

app.post("/authorize", function (req, res) {

    const payload = {
        deviceId: req.body.deviceId,
        notificationToken: req.body.notificationToken,
        username: req.body.username,
        displayName: req.body.displayName,
        platform: req.body.platform
    };
    if (payload.deviceId == null || payload.notificationToken == null || payload.username == null || payload.platform == null) {
        res.status(422).send({"status": "invalid_parameters"});
        return;
    }

    db.get("users").remove({deviceId: payload.deviceId}).write(); // remove old data with this token

    db.get("users").push(payload).write();

    res.send({
        "apiToken": payload.deviceId
    });

});


// ========================================================= //
//
// app.use(function (req, res, next) {
//     next(createError(404));
// });
//
//
// app.use(function (err, req, res, next) {
//     res.locals.message = err.message;
//     res.locals.error = req.app.get('env') === 'development' ? err : {};
//
//     // render the error page
//     res.status(err.status || 500);
//     res.render('error');
// });


function sendNotification(username, token, payload, platform) {
    console.log("Send Notification To ", username, token, payload, platform);
    if (platform === "android") {
        const message = {
            data: {
                action: 'call',
                payload: JSON.stringify(payload)
            },
            token: token
        };

        firebaseAdmin.messaging().send(message).then((response) => {
            console.log('Firebase push notification sent message:', response);
        }).catch((error) => {
            console.log('Firebase error sending message:', error);
        });
    }
    else {
        const notification = new apn.Notification();
        notification.topic = "io.avanegar.ios.sample.voip";
        notification.body = JSON.stringify(payload);
        notification.badge = 10;
        appleApnProvider.send(notification, token).then((result) => {
            console.log("Apple push notification result : ", result);
        });

    }
}


console.log("Kavenegar Backend Sample Config : ", JSON.stringify(config, undefined, 4));

module.exports = app;


