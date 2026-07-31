import { toJsonResume } from '../src/lib/export-jsonresume';
import { buildVariants } from './lib/build-variants';

buildVariants({
  format: 'json',
  ext: 'json',
  // sections — тот же гейт, что у md/txt: секция вне target'а в JSON не попадает.
  render: (doc, target) =>
    JSON.stringify(toJsonResume(doc, target.sections), null, 2) + '\n',
  kind: 'Сгенерировано JSON Resume',
});
