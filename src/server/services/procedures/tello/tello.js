/*
 * Author: Yuhang Liu <yuhang.liu.1@vanderbilt.edu>
 */

const RESPONSE_TIMEOUT = 500; // default reponse wait time in milliseconds 
const ReadCommands = ['speed?', 'battery?', 'time?', 'height?', 'temp?', 'attitude?', 
    'baro?', 'acceleration?', 'tof?', 'wifi?'];
const ControlCommands = ['command', 'takeoff', 'land', 'streamon', 'streamoff', 'emergency', 
    'up', 'down', 'left', 'right', 'forward', 'back', 'cw', 'ccw', 'flip', 'go', 'curve'];
const SetCommands = ['speed', 'rc', 'wifi'];

const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
var clientAddr = 'localhost';
var clientPort = 9000;
var callbacks = {}; // transaction_id : callback
var transaction_id = 1;
socket.on('message', function(msg, rinfo) {
    var message = msg.toString();
    var trans_id = message.split(" ")[0];
    if (trans_id == 0) {
        clientAddr = rinfo.address;
        clientPort = rinfo.port;
    } else {
        if (callbacks[trans_id]) {
            var resolve = callbacks[trans_id];
            delete callbacks[trans_id];
            resolve(message.substr(message.indexOf(' ') + 1));
        }
    }
});
socket.bind(9001);
const TelloService = {};

/**
 * Sends a textual command to tello
 * @param {String} textual command
 * @return {String} tello response
 */
TelloService.send = function(command) {
    var str = command.split(' ')[0];
    var timeout = RESPONSE_TIMEOUT;
    if (ReadCommands.includes(str)) {
        timeout = 200;
    } else if (ControlCommands.includes(str)) {
        timeout = 5000;
    } else if (SetCommands.includes(str)) {
        timeout = 200;
    } else {
        return 'Invalid Command';
    }
    const currentTransId = transaction_id++;
    socket.send(Buffer.from(currentTransId + " " + command), clientPort, clientAddr);
    var promise = new Promise(function (resolve) {
        callbacks[currentTransId] = resolve;
        setTimeout(function() {
            if (callbacks[currentTransId]) {
                delete callbacks[currentTransId];
            }
            resolve('Client timeout')
        }, RESPONSE_TIMEOUT);
    });
    return promise.then();
}

module.exports = TelloService;