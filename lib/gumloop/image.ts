// 兼容层：从 file.ts 重导出所有内容
// 保持向后兼容，现有代码无需修改

export {
  uploadFile as uploadImage,
  createFilePart as createImagePart,
  extractFile as extractImage,
  extractClaudeImage,
  extractOpenAIImage,
  extractGeminiFile as extractGeminiImage,
  type UploadedFile as UploadedImage,
  type FilePart as ImagePart,
  type ExtractedFile as ExtractedImage,
} from './file'
