import { describe, it, expect } from 'vitest';
import { formatPower, formatEnergyKwh, formatEntityValue } from '../src/core/format/format';
import { powerUnit, energyUnit } from '../src/core/config/helios-config';
import type { HassLike } from '../src/core/ha-types';
import type { HeliosConfig } from '../src/core/config/helios-config';

const hass = { language: 'en' } as unknown as HassLike;
const cfg = (o: Record<string, unknown>) => o as unknown as HeliosConfig;

//One global unit cannot serve a heat pump and a dryer's maintenance cycle at once: in kW the eighty watts read
//"0 kW", in W the heat pump reads "4,200 W" everywhere. Adaptive leaves the choice to each value.

describe('the adaptive power unit', () =>
{
    it('prints watts below a kilowatt and kilowatts above', () =>
    {
        expect(formatPower(hass, 80, 1, 'adaptive')).toBe('80 W');
        expect(formatPower(hass, 2400, 1, 'adaptive')).toBe('2.4 kW');
    });

    it('changes over at exactly one kilowatt', () =>
    {
        expect(formatPower(hass, 999, 1, 'adaptive')).toBe('999 W');
        expect(formatPower(hass, 1000, 1, 'adaptive')).toBe('1.0 kW');
    });

    it('reads a negative value by its magnitude, not its sign', () =>
    {
        expect(formatPower(hass, -80, 1, 'adaptive', true)).toBe('-80 W');
        expect(formatPower(hass, -2400, 1, 'adaptive', true)).toBe('-2.4 kW');
    });

    it('leaves the two fixed units exactly as they were', () =>
    {
        expect(formatPower(hass, 80, 1, 'kW')).toBe('0.1 kW');
        expect(formatPower(hass, 2400, 1, 'W')).toBe('2,400 W');
    });
});

describe('the adaptive energy unit', () =>
{
    it('changes over at one kilowatt-hour', () =>
    {
        expect(formatEnergyKwh(hass, 0.08, 1, 'adaptive')).toBe('80 Wh');
        expect(formatEnergyKwh(hass, 2.4, 1, 'adaptive')).toBe('2.4 kWh');
    });

    it('follows the power unit on a live chip, whichever family the entity reports in', () =>
    {
        expect(formatEntityValue(hass, 80, 'W', 1, 'adaptive')).toBe('80 W');
        expect(formatEntityValue(hass, 0.08, 'kWh', 1, 'adaptive')).toBe('80 Wh');
        expect(formatEntityValue(hass, 2.4, 'kWh', 1, 'adaptive')).toBe('2.4 kWh');
    });
});

describe('the config resolvers', () =>
{
    it('default to kilowatts as they always have', () =>
    {
        expect(powerUnit(undefined)).toBe('kW');
        expect(energyUnit(undefined)).toBe('kWh');
        expect(energyUnit(cfg({ 'power-unit': 'W' }))).toBe('Wh');
    });

    it('carry adaptive from power to energy, so the rule is chosen once', () =>
    {
        expect(powerUnit(cfg({ 'power-unit': 'adaptive' }))).toBe('adaptive');
        expect(energyUnit(cfg({ 'power-unit': 'adaptive' }))).toBe('adaptive');
        expect(energyUnit(cfg({ 'power-unit': 'adaptive', 'energy-unit': 'auto' }))).toBe('adaptive');
    });

    it('still lets the energy unit be set on its own', () =>
    {
        expect(energyUnit(cfg({ 'power-unit': 'adaptive', 'energy-unit': 'kWh' }))).toBe('kWh');
        expect(energyUnit(cfg({ 'power-unit': 'kW', 'energy-unit': 'adaptive' }))).toBe('adaptive');
    });
});
