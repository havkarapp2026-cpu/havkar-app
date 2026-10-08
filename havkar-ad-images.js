/*
 * HAVKAR advertisement image uploads.
 *
 * New images go to the existing public ad-images bucket.
 * The browser uses the signed-in user's Supabase client only.
 * There is no delete call: Storage DELETE is intentionally disabled.
 */
(function (root, factory) {

  const api =
    factory();

  if (
    typeof module === "object" &&
    module.exports
  ) {

    module.exports =
      api;

  }

  root.HAVKAR_AD_IMAGES =
    api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const BUCKET =
    "ad-images";

  const MAX_BYTES =
    5242880;

  const TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const OBJECT_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;


  function fail(
    code,
    message
  ) {

    const error =
      new Error(message);

    error.code =
      code;

    error.orphans =
      [];

    error.unconfirmed =
      [];

    return error;

  }


  function normalizeDeclaredType(
    type
  ) {

    const value =
      String(type || "")
        .toLowerCase()
        .split(";")[0]
        .trim();

    if (
      value === "image/jpg" ||
      value === "image/pjpeg"
    ) {

      return "image/jpeg";

    }

    return value;

  }


  function detectImageType(
    bytes
  ) {

    if (
      !bytes ||
      bytes.length < 3
    ) {

      return "";

    }

    if (
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {

      return "image/jpeg";

    }

    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {

      return "image/png";

    }

    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {

      return "image/webp";

    }

    return "";

  }


  async function readHeader(
    file
  ) {

    if (
      !file ||
      typeof file.slice !== "function"
    ) {

      throw fail(
        "READ",
        "Could not read image file."
      );

    }

    const header =
      file.slice(0, 16);

    if (
      !header ||
      typeof header.arrayBuffer !== "function"
    ) {

      throw fail(
        "READ",
        "Could not read image file."
      );

    }

    const buffer =
      await header.arrayBuffer();

    return new Uint8Array(buffer);

  }


  function normalizeUserId(
    userId
  ) {

    const value =
      String(userId || "")
        .trim()
        .toLowerCase();

    if (!UUID_PATTERN.test(value)) {

      return "";

    }

    return value;

  }


  function createFileId() {

    const cryptoApi =
      globalThis.crypto;

    if (
      !cryptoApi ||
      typeof cryptoApi.randomUUID !== "function"
    ) {

      throw fail(
        "NAME",
        "Secure image names are unavailable in this browser."
      );

    }

    const fileId =
      String(cryptoApi.randomUUID())
        .toLowerCase();

    if (!UUID_PATTERN.test(fileId)) {

      throw fail(
        "NAME",
        "Secure image names are unavailable in this browser."
      );

    }

    return fileId;

  }


  async function validateAdImage(
    file,
    options
  ) {

    const settings =
      options || {};

    const declared =
      normalizeDeclaredType(
        file && file.type
      );

    if (
      declared &&
      !TYPES[declared]
    ) {

      throw fail(
        "TYPE",
        "Please choose a JPEG, PNG, or WebP image."
      );

    }

    const detected =
      detectImageType(
        await readHeader(file)
      );

    if (
      !detected ||
      (
        declared &&
        declared !== detected
      )
    ) {

      throw fail(
        "TYPE",
        "Please choose a JPEG, PNG, or WebP image."
      );

    }

    if (settings.enforceSize !== false) {

      if (
        typeof file.size !== "number" ||
        file.size < 1 ||
        file.size > MAX_BYTES
      ) {

        throw fail(
          "SIZE",
          "Please choose an image smaller than 5 MB."
        );

      }

    }

    return {
      contentType: detected,
      extension: TYPES[detected]
    };

  }


  function blobForUpload(
    file,
    contentType
  ) {

    const rawType =
      String(file && file.type || "")
        .toLowerCase()
        .split(";")[0]
        .trim();

    if (rawType === contentType) {

      return file;

    }

    return new Blob(
      [file],
      {
        type: contentType
      }
    );

  }


  function isSafePublicUrl(
    value,
    objectPath
  ) {

    if (
      typeof value !== "string" ||
      !value.startsWith("https://")
    ) {

      return false;

    }

    let parsed;

    try {

      parsed =
        new URL(value);

    } catch (error) {

      return false;

    }

    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password
    ) {

      return false;

    }

    const encoded =
      objectPath
        .split("/")
        .map(encodeURIComponent)
        .join("/");

    const expected = [
      "/storage/v1/object/public/" + BUCKET + "/" + objectPath,
      "/storage/v1/object/public/" + BUCKET + "/" + encoded
    ];

    return expected.indexOf(parsed.pathname) !== -1;

  }


  function storageBucket(
    client
  ) {

    if (
      !client ||
      !client.storage ||
      typeof client.storage.from !== "function"
    ) {

      throw fail(
        "STORAGE",
        "Image storage is unavailable."
      );

    }

    return client.storage.from(BUCKET);

  }


  function publicUrlFor(
    bucket,
    objectPath
  ) {

    if (
      !bucket ||
      typeof bucket.getPublicUrl !== "function"
    ) {

      return "";

    }

    const result =
      bucket.getPublicUrl(objectPath);

    const value =
      result &&
      result.data &&
      result.data.publicUrl;

    return typeof value === "string"
      ? value
      : "";

  }


  async function uploadAdvertisementImages(
    client,
    userId,
    files
  ) {

    if (!Array.isArray(files)) {

      throw fail(
        "INPUT",
        "Could not read the selected images."
      );

    }

    const ownerId =
      normalizeUserId(userId);

    if (!ownerId) {

      throw fail(
        "AUTH",
        "Please login before posting an ad."
      );

    }

    if (!files.length) {

      return [];

    }

    const bucket =
      storageBucket(client);

    const uploaded =
      [];

    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {

      let prepared;

      try {

        prepared =
          await validateAdImage(
            files[index]
          );

      } catch (error) {

        error.orphans =
          uploaded.slice();

        error.message =
          "Could not upload every image. The advertisement was not saved. " +
          error.message;

        throw error;

      }

      let fileId;

      try {

        fileId =
          createFileId();

      } catch (nameError) {

        nameError.orphans =
          uploaded.slice();

        throw nameError;

      }

      const objectPath =
        ownerId +
        "/" +
        fileId +
        "." +
        prepared.extension;

      if (!OBJECT_PATTERN.test(objectPath)) {

        const invalidPath =
          fail(
            "NAME",
            "Could not prepare a safe image name. The advertisement was not saved."
          );

        invalidPath.orphans =
          uploaded.slice();

        throw invalidPath;

      }

      let result;

      try {

        result =
          await bucket.upload(
            objectPath,
            blobForUpload(
              files[index],
              prepared.contentType
            ),
            {
              contentType: prepared.contentType,
              cacheControl: "3600",
              upsert: false
            }
          );

      } catch (networkError) {

        const interrupted =
          fail(
            "UPLOAD",
            "Could not upload every image. The advertisement was not saved."
          );

        interrupted.orphans =
          uploaded.slice();

        interrupted.unconfirmed =
          [objectPath];

        throw interrupted;

      }

      if (
        !result ||
        result.error
      ) {

        const rejected =
          fail(
            "UPLOAD",
            "Could not upload every image. The advertisement was not saved."
          );

        rejected.orphans =
          uploaded.slice();

        throw rejected;

      }

      const publicUrl =
        publicUrlFor(
          bucket,
          objectPath
        );

      if (
        !isSafePublicUrl(
          publicUrl,
          objectPath
        )
      ) {

        const addressError =
          fail(
            "URL",
            "Could not create a public image address. The advertisement was not saved."
          );

        addressError.orphans =
          uploaded.concat(objectPath);

        throw addressError;

      }

      uploaded.push(publicUrl);

    }

    return uploaded;

  }


  const UNCERTAIN_PUBLISH_MESSAGE =
    "The server has not confirmed this advertisement yet. It may still be published. Do not submit it again. Check your existing advertisements before posting again.";


  function classifyInsertResult(
    result
  ) {

    const uncertain = {
      outcome: "uncertain",
      claimNotSaved: false,
      allowRetry: false,
      message: UNCERTAIN_PUBLISH_MESSAGE
    };

    if (
      !result ||
      typeof result !== "object"
    ) {

      return uncertain;

    }

    if (!result.error) {

      return {
        outcome: "saved",
        claimNotSaved: false,
        allowRetry: false,
        message: ""
      };

    }

    const status =
      Number(
        result.status
      );

    const code =
      String(
        result.error.code ||
        ""
      );

    const serverCode =
      /^[0-9A-Z]{5}$/.test(code) ||
      code.indexOf("PGRST") === 0;

    if (
      status === 0 ||
      status === 408 ||
      status >= 500
    ) {

      return uncertain;

    }

    if (
      (
        Number.isInteger(status) &&
        status >= 400 &&
        status < 500
      ) ||
      serverCode
    ) {

      const reason =
        result.error.message ||
        result.error.details ||
        result.error.hint ||
        "Supabase could not create the ad.";

      return {
        outcome: "rejected",
        claimNotSaved: true,
        allowRetry: true,
        message: String(reason)
      };

    }

    return uncertain;

  }


  function createPostingGuard() {

    let validationCount =
      0;

    let phase =
      "idle";

    let snapshot =
      [];


    function canSubmit() {

      return validationCount === 0 &&
        phase === "idle";

    }


    function canEditImages() {

      return phase === "idle";

    }


    function blockedMessage() {

      if (validationCount > 0) {

        return "Please wait until the selected photos finish checking.";

      }

      if (phase === "publishing") {

        return "Publishing is still in progress. Do not submit it again.";

      }

      if (phase === "saved") {

        return "Your ad has been published successfully!";

      }

      if (phase === "uncertain") {

        return UNCERTAIN_PUBLISH_MESSAGE;

      }

      return "Please wait until the selected photos finish checking.";

    }


    return {
      canSubmit: canSubmit,
      canEditImages: canEditImages,
      isValidating: function () {

        return validationCount > 0;

      },
      phase: function () {

        return phase;

      },
      blockedMessage: blockedMessage,
      uncertainMessage: function () {

        return UNCERTAIN_PUBLISH_MESSAGE;

      },
      beginValidation: function () {

        if (phase !== "idle") {

          return false;

        }

        validationCount += 1;

        return true;

      },
      endValidation: function () {

        validationCount =
          Math.max(
            0,
            validationCount - 1
          );

      },
      beginPublish: function (files) {

        if (!canSubmit()) {

          return null;

        }

        phase =
          "publishing";

        snapshot =
          Array.isArray(files)
            ? files.slice()
            : [];

        return snapshot.slice();

      },
      markUncertain: function () {

        if (phase === "uncertain") {

          return {
            changed: false,
            claimNotSaved: false,
            allowRetry: false,
            message: UNCERTAIN_PUBLISH_MESSAGE
          };

        }

        if (phase !== "publishing") {

          return {
            changed: false,
            claimNotSaved: false,
            allowRetry: false,
            message: ""
          };

        }

        phase =
          "uncertain";

        return {
          changed: true,
          claimNotSaved: false,
          allowRetry: false,
          message: UNCERTAIN_PUBLISH_MESSAGE
        };

      },
      markSaved: function () {

        if (
          phase !== "publishing" &&
          phase !== "uncertain"
        ) {

          return false;

        }

        phase =
          "saved";

        return true;

      },
      releaseAfterSave: function () {

        if (phase !== "saved") {

          return false;

        }

        phase =
          "idle";

        snapshot =
          [];

        return true;

      },
      markFailed: function () {

        if (
          phase !== "publishing" &&
          phase !== "uncertain"
        ) {

          return false;

        }

        phase =
          "idle";

        snapshot =
          [];

        return true;

      }
    };

  }


  function createImageSelection() {

    let token =
      0;

    let pending =
      false;

    let current =
      null;


    return {
      begin: function (file) {

        token += 1;

        pending =
          true;

        current =
          null;

        return {
          token: token,
          file: file
        };

      },
      succeed: function (ticket, file) {

        if (
          !ticket ||
          ticket.token !== token
        ) {

          return false;

        }

        pending =
          false;

        current =
          file;

        return true;

      },
      fail: function (ticket) {

        if (
          !ticket ||
          ticket.token !== token
        ) {

          return false;

        }

        pending =
          false;

        current =
          null;

        return true;

      },
      clearIfCurrent: function (file) {

        if (
          pending ||
          current !== file
        ) {

          return false;

        }

        current =
          null;

        return true;

      },
      reset: function () {

        token += 1;

        pending =
          false;

        current =
          null;

      },
      isPending: function () {

        return pending;

      },
      canPublish: function () {

        return !pending;

      },
      selectedFile: function () {

        if (pending) {

          return null;

        }

        return current;

      }
    };

  }


  function incompleteSaveError(
    cause,
    orphans
  ) {

    const savedOrphans =
      Array.isArray(orphans)
        ? orphans.filter(Boolean)
        : [];

    const reason =
      cause &&
      cause.message
        ? String(cause.message)
        : "Supabase could not create the ad.";

    const error =
      fail(
        "SAVE",
        savedOrphans.length
          ? "The advertisement was not saved. " + reason
          : reason
      );

    error.orphans =
      savedOrphans.slice();

    return error;

  }


  function describeFailure(
    error
  ) {

    const orphans =
      error &&
      Array.isArray(error.orphans)
        ? error.orphans.filter(Boolean)
        : [];

    const unconfirmed =
      error &&
      Array.isArray(error.unconfirmed)
        ? error.unconfirmed.filter(Boolean)
        : [];

    return {
      summary:
        error && error.message
          ? String(error.message)
          : "Could not publish the advertisement.",
      orphans: orphans,
      unconfirmed: unconfirmed
    };

  }


  function appendFileList(
    container,
    label,
    values
  ) {

    if (
      !values ||
      !values.length
    ) {

      return;

    }

    const heading =
      document.createElement("p");

    heading.textContent =
      label;

    const list =
      document.createElement("ul");

    list.className =
      "notranslate orphan-files";

    values.forEach(function (value) {

      const item =
        document.createElement("li");

      item.textContent =
        String(value);

      list.appendChild(item);

    });

    container.appendChild(heading);
    container.appendChild(list);

  }


  function renderFailure(
    container,
    error
  ) {

    if (
      !container ||
      typeof document === "undefined"
    ) {

      return describeFailure(error);

    }

    const report =
      describeFailure(error);

    container.replaceChildren();

    const summary =
      document.createElement("div");

    summary.textContent =
      report.summary;

    container.appendChild(summary);

    appendFileList(
      container,
      "These uploaded files remain in storage because image deletion is disabled:",
      report.orphans
    );

    appendFileList(
      container,
      "This upload did not finish and may also remain in storage:",
      report.unconfirmed
    );

    return report;

  }


  return {
    BUCKET: BUCKET,
    MAX_BYTES: MAX_BYTES,
    validateAdImage: validateAdImage,
    uploadAdvertisementImages: uploadAdvertisementImages,
    incompleteSaveError: incompleteSaveError,
    classifyInsertResult: classifyInsertResult,
    createPostingGuard: createPostingGuard,
    createImageSelection: createImageSelection,
    describeFailure: describeFailure,
    renderFailure: renderFailure,
    normalizeUserId: normalizeUserId
  };

});
