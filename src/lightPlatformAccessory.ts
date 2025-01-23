import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { LightHomebridgePlatform } from './platform.js';

export class LightPlatformAccessory {
  private service: Service;
  private accessoryState = {
    On: false,
  };

  constructor(
        private readonly platform: LightHomebridgePlatform,
        private readonly accessory: PlatformAccessory,
        private readonly channel: number, // Номер каналу
  ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Arduino')
          .setCharacteristic(this.platform.Characteristic.Model, 'Light Controller')
          .setCharacteristic(this.platform.Characteristic.SerialNumber, `Channel ${this.channel}`);

        this.service = this.accessory.getService(this.platform.Service.Lightbulb)
            || this.accessory.addService(this.platform.Service.Lightbulb);

        this.service.setCharacteristic(this.platform.Characteristic.Name, `Light Channel ${this.channel}`);

        this.service.getCharacteristic(this.platform.Characteristic.On)
          .onGet(this.handleOnGet.bind(this))
          .onSet(this.handleOnSet.bind(this));
  }

  async handleOnGet(): Promise<CharacteristicValue> {
    this.platform.log.debug(`Checking state for channel ${this.channel}`);
    return this.platform.channelStates[this.channel - 1] ?? false;
  }

  async handleOnSet(value: CharacteristicValue) {
    this.accessoryState.On = value as boolean;
    const command = value ? `ON ${this.channel}\n` : `OFF ${this.channel}\n`;

    await this.platform.sendCommand(command);
    this.platform.log.debug(`Command sent: ${command.trim()}`);

    this.platform.channelStates[this.channel - 1] = value as boolean;
  }
}
