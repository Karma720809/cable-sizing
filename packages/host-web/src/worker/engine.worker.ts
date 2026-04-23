/**
 * Engine worker bootstrap.
 *
 * We don't redefine the protocol here — we just install the engine's own
 * handler, which already implements the frozen v1 envelope
 * ({ ok, type, requestId, data? | error? }).
 */
import { installWorkerHandler } from '@cable-sizing/engine';

installWorkerHandler();
