/**
 * Extensions Module
 * Exports all extension-related functionality
 */

export { ExtensionManager } from "./manager.js";
export { ExtensionDiscoveryService } from "./discovery.js";
export { ExtensionValidationService } from "./validation.js";
export { ExtensionConfigManager } from "../config/extensionConfig.js";
export { ExtensionAwareConnectionFactory } from "../connection/extensionFactory.js";

export {
  DxtManifest,
  UserConfigParam,
  ManifestServerConfig,
  ExtensionUserConfig,
  ExtensionConfig,
  HypertoolConfig,
  ExtensionMetadata,
  ValidationResult,
  ExtensionRuntimeConfig,
} from "../config/dxt-config.js";
