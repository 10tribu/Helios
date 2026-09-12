import { describe, it, expect } from 'vitest';
import { interpretBuildings, type RawBuilding } from '../src/scene/buildings';
import { HOME_MATCH_MAX_M } from '../src/core/config/constants';

//The map is not guaranteed to hold the house it is asked about. When it does not, the nearest footprint is a
//neighbour's, and drawing it as the home puts somebody else's roof under a sun arc that is centred correctly.

function square(cx: number, cy: number, half: number, distanceM: number): RawBuilding
{
    return {
        footprint: [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]],
        centerX:    cx,
        centerY:    cy,
        distanceM,
        osmHeightM: 6,
    };
}

const OPTS = { radiusM: 120, count: 20, realSize: true, fixedHeightM: 6, clusterRadiusM: 0 };

describe('the home building', () =>
{
    it('is the footprint that contains the home point', () =>
    {
        const out = interpretBuildings([square(1, 1, 6, 0), square(30, 0, 5, 25)], OPTS);
        const home = out.filter((b) => b.isHome);
        expect(home).toHaveLength(1);
        expect(home[0].placeholder).toBeUndefined();
        expect(home[0].centerX).toBeCloseTo(1);
    });

    it('is still the nearest footprint when the point sits just outside it', () =>
    {
        const out = interpretBuildings([square(8, 0, 5, HOME_MATCH_MAX_M - 1)], OPTS);
        expect(out.filter((b) => b.isHome)).toHaveLength(1);
        expect(out.find((b) => b.isHome)?.placeholder).toBeUndefined();
    });

    it('is a generic house when the nearest footprint is too far to be it', () =>
    {
        const neighbour = square(0, 40, 6, HOME_MATCH_MAX_M + 1);
        const out = interpretBuildings([neighbour], OPTS);
        const home = out.filter((b) => b.isHome);
        expect(home).toHaveLength(1);
        expect(home[0].placeholder).toBe(true);
        //Centred on the home point, which is the whole complaint: the scene and the HUD agree again.
        expect(home[0].centerX).toBeCloseTo(0);
        expect(home[0].centerY).toBeCloseTo(0);
    });

    it('keeps the real footprints around it as neighbours rather than hiding the street', () =>
    {
        const out = interpretBuildings(
            [square(0, 40, 6, HOME_MATCH_MAX_M + 1), square(30, 40, 6, HOME_MATCH_MAX_M + 20)], OPTS);
        const neighbours = out.filter((b) => !b.isHome);
        expect(neighbours).toHaveLength(2);
        expect(out.filter((b) => b.isHome)).toHaveLength(1);
    });

    it('does not adopt a far neighbour into the home cluster', () =>
    {
        //The cluster exists to pull an attached outbuilding into the home set. A placeholder has nothing
        //attached to it, and a radius wide enough to reach the neighbour must not make it the house again.
        const out = interpretBuildings(
            [square(0, 40, 6, HOME_MATCH_MAX_M + 1)], { ...OPTS, clusterRadiusM: 80 });
        expect(out.filter((b) => b.isHome).every((b) => b.placeholder === true)).toBe(true);
    });
});
