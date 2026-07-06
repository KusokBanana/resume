import { renderPlain } from '../src/lib/render-plain';
import { buildVariants } from './lib/build-variants';

buildVariants({
  format: 'txt',
  ext: 'txt',
  render: (doc, target) => renderPlain(doc, target.sections),
  kind: 'Сгенерировано TXT-файлов',
});
