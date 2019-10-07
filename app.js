var bodyParser = require('body-parser');
let createError = require('http-errors');
let express = require('express');
let path = require('path');

let app = express();

let router = express.Router();
// Database ========================================
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({users: []}).write();
// =================================================
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended: true}));

app.use(function (req, res, next) {
    var send = res.send;
    res.send = function (body) {
        console.log(req.method, req.url, "\r\nRequest => ", JSON.stringify(req.body, undefined, 4), "\r\nResponse => ", body, "\r\n=========================================================================");
        send.call(this, body);
    };

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.header("Access-Control-Max-Age","1800");

    next()

});
// ============================================================ //
const config = {
    kavenegarApiToken: process.env["npm_package_config_kavenegar_api_token"],
    apnCertificateFile: process.env["npm_package_config_apn_certificate_file"],
    apnTopic: process.env["npm_package_config_apn_topic"],
    apnCertificatePassword: process.env["npm_package_config_apn_certificate_password"],
    firebaseProjectFile: process.env["npm_package_config_firebase_project_file"],
    firebaseDatabaseURL: process.env["npm_package_config_firebase_database_url"]
};
console.log("Kavenegar Backend Sample Config : ", JSON.stringify(config, undefined, 4));
// ============================================================ //

let axios = require('axios');
const httpClient = axios.create({
    baseURL: 'https://api.kavenegar.io/user/v1/',
    timeout: 10000,
    headers: {'Authorization': "Bearer " + config.kavenegarApiToken}
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
    res.send(db.get("users").value());
});

app.post("/calls", function (req, res) {

    var deviceId = req.header("authorization");

    var caller = db.get("users").find({deviceId: deviceId}).value();
    var receptor = db.get("users").find({username: req.body.receptor}).value();

    if (caller == null || receptor == null) {
        res.status(500).send({status: "local_invalid_caller_or_receptor"});
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

    httpClient.post("calls", payload).then((response) => {

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
        res.status(422).send({"status": "local_invalid_parameters"});
        return;
    }

    db.get("users").remove({username: payload.username}).write(); // remove old data with this token

    db.get("users").push(payload).write();

    res.send({
        "apiToken": payload.deviceId
    });

});


function sendNotification(username, token, payload, platform) {
    console.log("Send Notification To ", username, token, payload, platform);
    if (platform === "android" || platform === "web") {
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
        notification.topic = config.apnTopic + ".voip";
        notification.body = JSON.stringify(payload);
        notification.badge = 10;
        appleApnProvider.send(notification, token).then((result) => {
            console.log("Apple push notification result : ", result);
        });

    }
}


module.exports = app;


