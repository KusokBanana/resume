import { toJsonResume } from '../src/lib/export-jsonresume';
import { buildVariants } from './lib/build-variants';

buildVariants({
  format: 'json',
  ext: 'json',
  render: (doc) => JSON.stringify(toJsonResume(doc), null, 2) + '\n',
  kind: 'Сгенерировано JSON Resume',
});
