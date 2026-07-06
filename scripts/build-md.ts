import { renderMarkdown } from '../src/lib/render-md';
import { buildVariants } from './lib/build-variants';

buildVariants({
  format: 'md',
  ext: 'md',
  render: (doc, target) => renderMarkdown(doc, target.sections),
  kind: 'Сгенерировано MD-файлов',
});
