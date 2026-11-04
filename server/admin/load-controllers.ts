import controllers from './controller-registry';
import { registerController } from './crud.controller';

export function loadCrudControllers() {
    for (const Controller of controllers) registerController(new Controller());
}
