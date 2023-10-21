const fsPromises = require("fs/promises");
const { google } = require("googleapis");
const core = require("@actions/core");
const matter = require("gray-matter");

async function main({ googleDriveFolderId, outputDirectoryPath }) {
  const drive = google.drive({
    auth: new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    }),
    version: "v3",
  });

  core.info(`Connected to drive ${drive.id}`);

  const exportedFiles = await exportFiles({
    drive,
    files: await listFiles({ drive, googleDriveFolderId }),
  });

  await createDirectory({ outputDirectoryPath });

  await writeExportedFiles({ exportedFiles, outputDirectoryPath });
}

async function createDirectory({ outputDirectoryPath }) {
  await fsPromises.stat(outputDirectoryPath).catch((err) => {
    if (err.code === "ENOENT") {
      fsPromises.mkdir(outputDirectoryPath, { recursive: true });
    }
  });
}

async function exportFile({ drive, fileId }) {
  const response = await drive.files.get({
    fileId,
    alt: 'media'
  });
  return response.data;
}

async function exportFiles({ drive, files }) {
  return Promise.all(
    files.map(async (file) => {
      const content = await exportFile({
        drive,
        fileId: file.id,
      });
      return {
        ...file,
        content,
      };
    })
  );
}

async function listFiles({ drive, googleDriveFolderId }) {
  core.info(`About to list files for ${googleDriveFolderId}`);
  const response = await drive.files.list({
    fields: "nextPageToken, files(id, name, createdTime, modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 1000,
    q: `'${googleDriveFolderId}' in parents and mimeType = 'text/markdown'`,
  });
  core.info(`Found ${response.data.files.length} files`);
  return response.data.files;
}


async function writeExportedFiles({ exportedFiles, outputDirectoryPath }) {
  exportedFiles.forEach(async (exportedFile) => {
    const outputFilePath = `${outputDirectoryPath}/${exportedFile.name}`;
    core.info(`Writing file ${outputFilePath}`);
    await fsPromises.writeFile(
      outputFilePath,
      matter.stringify(exportedFile.content)
    );
  });
}

main({
  googleDriveFolderId: core.getInput("google_drive_folder_id"),
  outputDirectoryPath: core.getInput("output_directory_path"),
}).catch(core.setFailed);
