const fs = require("fs");
const path = require("path");
const config = require("config");
const { randomString } = require("../shared/generator");
const FileType = require("file-type");

const { uploadDir, profileDir } = config;
const profileFolder = path.join(".", uploadDir, profileDir);

const createFolders = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
  if (!fs.existsSync(profileFolder)) {
    fs.mkdirSync(profileFolder);
  }
};

const saveProfileImage = async (base64File) => {
  const filename = randomString(32);
  const filePath = path.join(profileFolder, filename);
  await fs.promises.writeFile(filePath, base64File, "base64");
  return filename;
};

const deleteProfileimage = async (filename) => {
  const filePath = path.join(profileFolder, filename);
  await fs.promises.unlink(filePath);
};

const isLessThan2MB = (buffer) => {
  return buffer.length < 2 * 1024 * 1024;
};

const isSupportedFileType = async (buffer) => {
  const type = await FileType.fileTypeFromBuffer(buffer);
  return !type
    ? false
    : type.mime === "image/png" || type.mime === "image/jpeg";
};

module.exports = {
  createFolders,
  saveProfileImage,
  deleteProfileimage,
  isLessThan2MB,
  isSupportedFileType,
};
