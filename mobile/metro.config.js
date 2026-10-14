// الحزمة المشتركة (packages/shared) تقع خارج مجلد التطبيق وتُستهلك من المصدر — يجب أن يراقبها Metro.
// الاسم المستعار @sanad/shared يأتي من tsconfig.json (tsconfigPaths مفعّل افتراضياً في Expo).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../packages/shared")];
// ملفات الحزمة المشتركة لا تملك node_modules خاصة بها؛ ما يحقنه Babel فيها (مثل ‎@babel/runtime) يُحلّ من مجلد التطبيق
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), path.resolve(__dirname, "node_modules")];

module.exports = config;
