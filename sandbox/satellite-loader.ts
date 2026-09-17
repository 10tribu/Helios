// Satellite imagery tile loader for Helios Sandbox.
// Fetches high-resolution satellite tiles (Esri World Imagery or custom XYZ provider)
// covering a radius around the home, composites them onto a high-res ground canvas,
// and computes the homeX/homeY/scale parameters required by SceneRenderer's 2.5D groundTransform.

import { lonLatToTile, pxPerMetreFor } from '../src/scene/tiles';
import { GROUND_ZOOM, GROUND_REACH_M, TILE_PX } from '../src/core/config/constants';

export const DEFAULT_SATELLITE_PROVIDER =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export interface SatelliteGroundLevel {
    canvas: HTMLCanvasElement;
    homeX: number;
    homeY: number;
    scale: number;
    size: number;
    zoom: number;
    lat: number;
    lon: number;
    radiusM: number;
}

export interface SatelliteLoadOptions {
    zoom?: number;
    provider?: string;
    signal?: AbortSignal;
    onTileLoaded?: () => void;
}

// In-memory cache for tile HTMLImageElements across re-renders
const tileImageCache = new Map<string, Promise<HTMLImageElement | null>>();

function fetchTileImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
    const cached = tileImageCache.get(url);
    if (cached) {
        return cached;
    }

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
        if (signal?.aborted) {
            resolve(null);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';

        const onAbort = (): void => {
            img.onload = null;
            img.onerror = null;
            resolve(null);
        };

        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        img.onload = () => {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve(img);
        };

        img.onerror = () => {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            resolve(null);
        };

        img.src = url;
    });

    tileImageCache.set(url, promise);
    return promise;
}

/**
 * Loads satellite tiles around (lat, lon) within `radiusM` at a specific zoom level (17..19),
 * and paints them into an aligned canvas for the 2.5D scene renderer.
 */
export async function loadSatelliteGround(
    lat: number,
    lon: number,
    radiusM: number,
    options: SatelliteLoadOptions = {}
): Promise<SatelliteGroundLevel | null> {
    const zoom = options.zoom ?? 18;
    const provider = options.provider ?? DEFAULT_SATELLITE_PROVIDER;
    const signal = options.signal;

    if (signal?.aborted) {
        return null;
    }

    // Helios ground geometry:
    // Base scale is GROUND_ZOOM = 19 (pxPerMetreFor(lat, GROUND_ZOOM)).
    // A canvas painted at tile zoom Z covers:
    // 1 canvas px = 2 ** (GROUND_ZOOM - zoom) base pixels.
    // Therefore levelScale = 2 ** (GROUND_ZOOM - zoom).
    // E.g.:
    // - at Z=19: scale = 1
    // - at Z=18: scale = 2
    // - at Z=17: scale = 4
    const scale = 2 ** (GROUND_ZOOM - zoom);

    const [homeTileX, homeTileY] = lonLatToTile(lon, lat, zoom);
    const pxPerM = pxPerMetreFor(lat, zoom);
    const targetReachM = Math.max(radiusM * 1.25, GROUND_REACH_M);
    const radiusInTiles = (targetReachM * pxPerM) / TILE_PX;

    // Symmetric tile bounds centered on home, clamped to reasonable maximums
    const maxHalfTiles = zoom === 19 ? 5 : 4;
    const clampedRadius = Math.min(maxHalfTiles, Math.ceil(radiusInTiles));

    const minTx = Math.floor(homeTileX - clampedRadius);
    const maxTx = Math.ceil(homeTileX + clampedRadius);
    const minTy = Math.floor(homeTileY - clampedRadius);
    const maxTy = Math.ceil(homeTileY + clampedRadius);

    const cols = maxTx - minTx + 1;
    const rows = maxTy - minTy + 1;

    const canvasWidth = cols * TILE_PX;
    const canvasHeight = rows * TILE_PX;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.className = 'ground satellite-ground';

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    // Exact home position within this composite canvas
    const homeX = (homeTileX - minTx) * TILE_PX;
    const homeY = (homeTileY - minTy) * TILE_PX;

    const groundLevel: SatelliteGroundLevel = {
        canvas,
        homeX,
        homeY,
        scale,
        size: Math.max(canvasWidth, canvasHeight),
        zoom,
        lat,
        lon,
        radiusM,
    };

    // Sort tiles by distance to home so the immediate vicinity under the buildings renders first
    interface TileJob {
        tx: number;
        ty: number;
        distSq: number;
    }
    const tileJobs: TileJob[] = [];
    for (let tx = minTx; tx <= maxTx; tx++) {
        for (let ty = minTy; ty <= maxTy; ty++) {
            const dx = (tx + 0.5) - homeTileX;
            const dy = (ty + 0.5) - homeTileY;
            tileJobs.push({ tx, ty, distSq: dx * dx + dy * dy });
        }
    }
    tileJobs.sort((a, b) => a.distSq - b.distSq);

    // Load tiles asynchronously in sorted order
    for (const job of tileJobs) {
        const tileX = job.tx;
        const tileY = job.ty;
        const url = provider
            .replace('{z}', String(zoom))
            .replace('{x}', String(tileX))
            .replace('{y}', String(tileY));

        fetchTileImage(url, signal).then((img) => {
            if (img && !signal?.aborted) {
                const destX = (tileX - minTx) * TILE_PX;
                const destY = (tileY - minTy) * TILE_PX;
                ctx.drawImage(img, destX, destY, TILE_PX, TILE_PX);
                options.onTileLoaded?.();
            }
        });
    }

    // Return the level immediately so the canvas is in the DOM;
    // tiles will progressively paint onto it as they resolve.
    return groundLevel;
}

/** Clear cached tile images. */
export function clearSatelliteTileCache(): void {
    tileImageCache.clear();
}
