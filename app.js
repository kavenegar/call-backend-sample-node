var bodyParser = require('body-parser');
let createError = require('http-errors');
let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let logger = require('morgan');
let app = express();
let router = express.Router();
let notificationSender = require('./notificationSender');
// Database ========================================
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({users: []}).write();
// =================================================

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended: true}));

// ============================================================ //


let axios = require('axios');
const httpClient = axios.create({
    baseURL: 'https://api.kavenegar.io/user/v1/',
    timeout: 10000,
    headers: {'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJpbmZvQG1vaHNlbi53b3JrIiwicm9sZXMiOiJ1c2VyIiwidXNlcklkIjoxLCJhcHBsaWNhdGlvbklkIjoxLCJpYXQiOjE1MjU1MDExNzd9.N7B7kB3ATFKYcUgVkpybKM5dMmSUlIDiycUMHd2_sLY'}
});


//============================================================//

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
        res.status(500).send({status: "invalid_caller_or_receptor"})
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

        var data = response.data;
        var notificationToken = receptor.notificationToken;
        notificationSender.send(notificationToken, {
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

app.use(function (req, res, next) {
    next(createError(404));
});


app.use(function (err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

console.log("[Kavenegar Backend Sample is running on port 3000]");

module.exports = app;


