// Firebase Messaging Config =============================================================== //

var admin = require('firebase-admin');
var serviceAccount = require('./kavenegar-call-android-sdk-firebase-adminsdk-w9qro-c95ba9eaf7.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://kavenegar-call-android-sdk.firebaseio.com'
});

// Apple Messaging Config =============================================================== //

var apn = require('apn');

var apnProvider = new apn.Provider({
    pfx: "./avanegar.p12",
    passphrase: "password",
    production: false
});

// =============================================================== //

module.exports = {
    send: function (token, payload, platform) {
        if (platform === "android") {


            var message = {
                data: {
                    action: 'call',
                    payload: JSON.stringify(payload)
                },
                token: token
            };

            admin.messaging().send(message).then((response) => {
                console.log('Firebase push notification sent message:', response);
            }).catch((error) => {
                console.log('Firebase error sending message:', error);
            });
        }
        else {

            var notification = new apn.Notification();
            notification.topic = "io.avanegar.ios.sample.voip";
            notification.body = JSON.stringify(payload);
            notification.badge = 10;
            apnProvider.send(notification, token).then((result) => {
                console.log("Apple push notification result : ", result);
            });

        }
    }
};