import type {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logging,
    PlatformAccessory,
    PlatformConfig,
    Service
} from 'homebridge';

import {LightPlatformAccessory} from './lightPlatformAccessory.js';
import {PLATFORM_NAME, PLUGIN_NAME} from './settings.js';

// This is only required when using Custom Services and Characteristics not support by HomeKit
// import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes';
import {SerialPort} from 'serialport';
import {SerialPortOpenOptions} from 'serialport';
import {ReadlineParser} from '@serialport/parser-readline';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LightHomebridgePlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: Map<string, PlatformAccessory> = new Map();

    public channelStates: boolean[] = [];
    private port: SerialPort;
    private parser: ReadlineParser;

    constructor(
        public readonly log: Logging,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.log.info('Finished initializing platform:', this.config.name);

        // Ініціалізація серійного порту
        this.port = new SerialPort({
            path: this.config.port || '/dev/ttyACM0',
            baudRate: 9600
        });
        this.parser = this.port.pipe(new ReadlineParser({delimiter: '\n'}));

        this.port.on('open', () => {
            this.log.info('Serial port opened');
        });

        this.port.on('error', (err) => {
            this.log.error('Serial port error:', err.message);
        });

        this.parser.on('data', (data: string) => {
            this.handleSerialData(data);
        });

        // Реєстрація аксесуарів
        this.api.on('didFinishLaunching', () => {
            this.log.info('DidFinishLaunching');
            this.discoverDevices();
        });
    }

    // Метод для обробки даних із серійного порту
    handleSerialData(data: string) {
        this.log.debug('Received data:', data);
        data = data.trim();

        if (data.startsWith('ERROR')) {
            this.log.error('Arduino reported an error:', data);
            return;
        }

        if (data.includes(',')) {
            // Очікуємо рядок типу "1,0,1,1,0,0,1,0"
            const states = data.split(',').map((s) => s === '1');
            this.channelStates = states;

            // Оновлюємо стан аксесуарів
            for (let i = 0; i < states.length; i++) {
                const accessory = Array.from(this.accessories.values()).find(
                    (a) => a.context.device.channel === i + 1
                );

                if (accessory) {
                    accessory.getService(this.Service.Lightbulb)!
                        .getCharacteristic(this.Characteristic.On)
                        .updateValue(typeof states[i] !== undefined ? states[i] : false);
                }
            }
        }
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);

        // add the restored accessory to the accessories cache, so we can track if it has already been registered
        this.accessories.set(accessory.UUID, accessory);
    }

    discoverDevices() {
        const properties = this.getConfigProperties();

        // loop over the discovered devices and register each one if it has not already been registered
        for (const device of properties.accessories) {
            const uuid = this.api.hap.uuid.generate(device.id);
            const existingAccessory = Array.from(this.accessories.values()).find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                this.log.info(`Updating accessory ${existingAccessory.displayName}`);
                new LightPlatformAccessory(this, existingAccessory, device.channel);

                continue;
            }

            this.log.info(`Create accessory ${device.name}`);

            const accessory = new this.api.platformAccessory(device.name, uuid);
            accessory.context.device = device;

            new LightPlatformAccessory(this, accessory, device.channel);

            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }

    public async sendCommand(command: string) {
        this.port.write(command, (err) => {
            if (err) {
                this.log.error('Error on write: ', err.message);
            } else {
                this.log.info(`Command sent: ${command.trim()}`);
            }
        });

        await this.updateStatus();
    }

    private async updateStatus() {
        this.port.write('STATUS', (err) => {
            if (err) {
                this.log.error('Error on write: ', err.message);
            } else {
                this.log.info(`Command sent: STATUS`);
            }
        });
    }

    // Get the config properties
    getConfigProperties() {
        const properties = {
            name: this.config.name?.toString().trim(),
            accessories: this.config.accessories,
        };

        this.log.info('Config properties:', properties);

        if (!this.isIterable(properties.accessories)) {
            properties.accessories = [];
        }

        return properties;
    }

    isIterable(value: unknown) {
        return Symbol.iterator in Object(value);
    }
}
