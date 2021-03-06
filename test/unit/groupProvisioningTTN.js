/*
 * Copyright 2018 Atos Spain S.A
 *
 * This file is part of iotagent-lora
 *
 * iotagent-lora is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * iotagent-lora is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with iotagent-lora.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 */

'use strict';

var request = require('request');
var async = require('async');
var test = require('unit.js');
var iotAgentConfig = require('../config-test.js');
var utils = require('../utils');
var iotagentLora = require('../../');
var iotAgentLib = require('iotagent-node-lib');
var mqtt = require('mqtt');

describe('Configuration provisioning API: Provision groups', function () {
    var testMosquittoHost = 'localhost';
    var orionHost = iotAgentConfig.iota.contextBroker.host;
    var orionPort = iotAgentConfig.iota.contextBroker.port;
    var orionServer = orionHost + ':' + orionPort;
    var service = 'smartgondor';
    var subservice = '/gardens';
    readEnvVariables();

    function readEnvVariables () {
        if (process.env.TEST_MOSQUITTO_HOST) {
            testMosquittoHost = process.env.TEST_MOSQUITTO_HOST;
        }

        if (process.env.IOTA_CB_HOST) {
            orionHost = process.env.IOTA_CB_HOST;
        }

        if (process.env.IOTA_CB_PORT) {
            orionPort = process.env.IOTA_CB_PORT;
        }

        orionServer = orionHost + ':' + orionPort;
    }

    before(function (done) {
        async.series([
            async.apply(utils.deleteEntityCB, iotAgentConfig.iota.contextBroker, service, subservice, 'lora_unprovisioned_device:LoraDeviceGroup'),
            async.apply(utils.deleteEntityCB, iotAgentConfig.iota.contextBroker, service, subservice, 'lora_unprovisioned_device2:LoraDeviceGroup'),
            async.apply(iotagentLora.start, iotAgentConfig)
        ], done);
    });

    after(function (done) {
        async.series([
            iotAgentLib.clearAll,
            iotagentLora.stop,
            async.apply(utils.deleteEntityCB, iotAgentConfig.iota.contextBroker, service, subservice, 'lora_unprovisioned_device:LoraDeviceGroup'),
            async.apply(utils.deleteEntityCB, iotAgentConfig.iota.contextBroker, service, subservice, 'lora_unprovisioned_device2:LoraDeviceGroup')
        ], done);
    });

    // TODO: We must fix this in the iotagent_node_lib
    //
    // describe('When a group provisioning request without internalAttributes arrives at the IoT Agent', function () {
    //     var options = {
    //         url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
    //         method: 'POST',
    //         json: utils.readExampleFile('./test/groupProvisioning/provisionGroupTTN_noInternalAttributes.json'),
    //         headers: {
    //             'fiware-service': service,
    //             'fiware-servicepath': subservice
    //         }
    //     };

    //     it('should answer with error', function (done) {
    //         request(options, function (error, response, body) {
    //             test.should.not.exist(error);
    //             test.object(response).hasProperty('statusCode', 500);
    //             done();
    //         });
    //     }); ;
    // });

    describe('When a configuration provisioning request with all the required data arrives to the IoT Agent', function () {
        var options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'POST',
            json: utils.readExampleFile('./test/groupProvisioning/provisionGroup1TTN.json'),
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        var devId = 'lora_unprovisioned_device';
        var cbEntityName = devId + ':' + options.json.services[0]['entity_type'];
        var optionsCB = {
            url: 'http://' + orionServer + '/v2/entities/' + cbEntityName,
            method: 'GET',
            json: true,
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        if (testMosquittoHost) {
            options.json.services[0]['internal_attributes']['lorawan']['application_server']['host'] = testMosquittoHost;
        }

        var optionsGetService = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'GET',
            json: true,
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        it('should add the group to the list', function (done) {
            request(options, function (error, response, body) {
                test.should.not.exist(error);
                test.object(response).hasProperty('statusCode', 201);
                setTimeout(function () {
                    request(optionsGetService, function (error, response, body) {
                        test.should.not.exist(error);
                        test.object(response).hasProperty('statusCode', 200);
                        test.object(body).hasProperty('entity_type', options.json.services[0]['entity_type']);
                        test.object(body).hasProperty('_id');
                        done();
                    });
                }, 500);
            });
        });

        it('Should register correctly new devices for the group and process their active attributes', function (done) {
            var attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp.json');
            attributesExample['dev_id'] = devId;
            var client = mqtt.connect('mqtt://' + testMosquittoHost);
            client.on('connect', function () {
                client.publish(options.json.services[0]['internal_attributes']['lorawan']['application_id'] + '/devices/' + devId + '/up', JSON.stringify(attributesExample));
                setTimeout(function () {
                    request(optionsCB, function (error, response, body) {
                        test.should.not.exist(error);
                        test.object(response).hasProperty('statusCode', 200);
                        test.object(body).hasProperty('id', cbEntityName);
                        test.object(body).hasProperty('temperature_1');
                        test.object(body['temperature_1']).hasProperty('type', 'Number');
                        test.object(body['temperature_1']).hasProperty('value', 27.2);
                        client.end();
                        return done();
                    });
                }, 1000);
            });
        });

        it('should add the device to the devices list', function (done) {
            var optionsGetDevice = {
                url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
                method: 'GET',
                json: true,
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };
            request(optionsGetDevice, function (error, response, body) {
                test.should.not.exist(error);
                test.object(response).hasProperty('statusCode', 200);
                test.object(body).hasProperty('count', 1);
                test.object(body).hasProperty('devices');
                test.array(body.devices);
                test.array(body.devices).hasLength(1);
                test.object(body.devices[0]).hasProperty('device_id', devId);
                done();
            });
        });
    });

    describe('After a restart', function () {
        var options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'POST',
            json: utils.readExampleFile('./test/groupProvisioning/provisionGroup1TTN.json'),
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        it('Should keep on listening to devices from provisioned groups', function (done) {
            var devId = 'lora_unprovisioned_device2';
            var cbEntityName = devId + ':' + options.json.services[0]['entity_type'];
            var optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/' + cbEntityName,
                method: 'GET',
                json: true,
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };

            async.waterfall([
                iotagentLora.stop,
                async.apply(iotagentLora.start, iotAgentConfig)
            ], function (err) {
                test.should.not.exist(err);
                var attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp3.json');
                attributesExample['dev_id'] = devId;
                var client = mqtt.connect('mqtt://' + testMosquittoHost);
                client.on('connect', function () {
                    client.publish(options.json.services[0]['internal_attributes']['lorawan']['application_id'] + '/devices/' + devId + '/up', JSON.stringify(attributesExample));
                    setTimeout(function () {
                        request(optionsCB, function (error, response, body) {
                            test.should.not.exist(error);
                            test.object(response).hasProperty('statusCode', 200);
                            test.object(body).hasProperty('id', cbEntityName);
                            test.object(body).hasProperty('temperature_1');
                            test.object(body['temperature_1']).hasProperty('type', 'Number');
                            test.object(body['temperature_1']).hasProperty('value', 28);
                            client.end();
                            return done();
                        });
                    }, 1000);
                });
            });
        });
    });
});
