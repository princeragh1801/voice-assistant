import base from '@jarvis/config/eslint/base';

export default [...base, { ignores: ['dist/**', 'src/generated/**'] }];
