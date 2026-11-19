import { createDeps } from '../deps';
import { runHousekeeping } from '../housekeeping';

const deps = createDeps();

export const handler = async () => runHousekeeping(deps);
