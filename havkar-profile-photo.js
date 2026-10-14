/*
 * HAVKAR profile photos.
 *
 * The photo file is avatar.webp inside the signed-in user's own folder.
 * profiles.avatar_url is the existing column. Auth metadata is not the photo record.
 * Other pages can request the public object by user id. If it is missing,
 * they keep the green initial.
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

  root.HAVKAR_PROFILE_PHOTO =
    api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const BUCKET =
    "avatars";

  const FILE_NAME =
    "avatar.webp";

  const MAX_SOURCE_BYTES =
    20 * 1024 * 1024;

  const MAX_OUTPUT_BYTES =
    5242880;

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  const SOURCE_TYPES = {
    "image/jpeg": true,
    "image/jpg": true,
    "image/pjpeg": true,
    "image/png": true,
    "image/webp": true,
    "image/heic": true,
    "image/heif": true
  };


  function fail(
    code,
    message
  ) {

    const error =
      new Error(message);

    error.code =
      code;

    return error;

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


  function objectPath(
    userId
  ) {

    const id =
      normalizeUserId(userId);

    if (!id) {

      return "";

    }

    return id + "/" + FILE_NAME;

  }


  function storageBase(
    supabaseUrl
  ) {

    return String(supabaseUrl || "")
      .trim()
      .replace(/\/+$/, "");

  }


  function publicObjectUrl(
    supabaseUrl,
    userId
  ) {

    const base =
      storageBase(supabaseUrl);

    const path =
      objectPath(userId);

    if (
      !base ||
      !path ||
      !/^https:\/\/[a-z0-9.-]+$/i.test(base)
    ) {

      return "";

    }

    return base +
      "/storage/v1/object/public/" +
      BUCKET +
      "/" +
      path;

  }


  function isOwnAvatarUrl(
    url,
    supabaseUrl,
    userId
  ) {

    const canonical =
      publicObjectUrl(
        supabaseUrl,
        userId
      );

    const value =
      String(url || "");

    if (
      !canonical ||
      !value
    ) {

      return false;

    }

    if (value === canonical) {

      return true;

    }

    return new RegExp(
      "^" +
      canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\?v=[0-9]+$"
    ).test(value);

  }


  function initialLetter(
    name
  ) {

    const text =
      String(name || "")
        .trim();

    if (!text) {

      return "H";

    }

    const first =
      Array.from(text)[0] || "";

    return first.toLocaleUpperCase() || "H";

  }


  function sourceExtension(
    name
  ) {

    const match =
      String(name || "")
        .toLowerCase()
        .match(/\.([a-z0-9]+)$/);

    return match
      ? match[1]
      : "";

  }


  function acceptsSource(
    file
  ) {

    if (!file) {

      return false;

    }

    const type =
      String(file.type || "")
        .toLowerCase()
        .split(";")[0]
        .trim();

    if (SOURCE_TYPES[type]) {

      return true;

    }

    if (!type) {

      return [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "heic",
        "heif"
      ].indexOf(sourceExtension(file.name)) !== -1;

    }

    return false;

  }


  function assertSource(
    file
  ) {

    if (!acceptsSource(file)) {

      throw fail(
        "TYPE",
        "Choose a JPG, PNG, WEBP, or camera photo."
      );

    }

    if (
      !Number.isFinite(file.size) ||
      file.size < 1
    ) {

      throw fail(
        "SIZE",
        "This photo could not be read."
      );

    }

    if (file.size > MAX_SOURCE_BYTES) {

      throw fail(
        "SIZE",
        "Choose a photo smaller than 20 MB. It is reduced before upload."
      );

    }

  }


  function coverScale(
    naturalWidth,
    naturalHeight,
    viewSize
  ) {

    return Math.max(
      viewSize / naturalWidth,
      viewSize / naturalHeight
    );

  }


  function clampOffset(
    offset,
    renderedSize,
    viewSize
  ) {

    const min =
      Math.min(
        0,
        viewSize - renderedSize
      );

    const value =
      Number(offset);

    if (!Number.isFinite(value)) {

      return min;

    }

    return Math.min(
      0,
      Math.max(min, value)
    );

  }


  function initialCrop(
    naturalWidth,
    naturalHeight,
    viewSize
  ) {

    const scale =
      coverScale(
        naturalWidth,
        naturalHeight,
        viewSize
      );

    return {
      zoom: 1,
      offsetX: (viewSize - naturalWidth * scale) / 2,
      offsetY: (viewSize - naturalHeight * scale) / 2
    };

  }


  function fitCrop(
    naturalWidth,
    naturalHeight,
    viewSize,
    zoom,
    offsetX,
    offsetY
  ) {

    const safeZoom =
      Math.min(
        3,
        Math.max(
          1,
          Number(zoom) || 1
        )
      );

    const scale =
      coverScale(
        naturalWidth,
        naturalHeight,
        viewSize
      ) * safeZoom;

    const drawWidth =
      naturalWidth * scale;

    const drawHeight =
      naturalHeight * scale;

    return {
      zoom: safeZoom,
      scale: scale,
      drawWidth: drawWidth,
      drawHeight: drawHeight,
      offsetX: clampOffset(
        offsetX,
        drawWidth,
        viewSize
      ),
      offsetY: clampOffset(
        offsetY,
        drawHeight,
        viewSize
      )
    };

  }


  function zoomOffset(
    offset,
    viewSize,
    previousScale,
    nextScale
  ) {

    const center =
      viewSize / 2;

    const sourcePoint =
      (center - Number(offset)) / previousScale;

    return center - sourcePoint * nextScale;

  }


  function blobFrom(
    canvas,
    type,
    quality
  ) {

    return new Promise(function (resolve) {

      if (
        !canvas ||
        typeof canvas.toBlob !== "function"
      ) {

        resolve(null);

        return;

      }

      canvas.toBlob(
        function (blob) {

          resolve(blob || null);

        },
        type,
        quality
      );

    });

  }


  async function exportWebp(
    image,
    crop
  ) {

    if (
      typeof document === "undefined" ||
      !image ||
      !crop
    ) {

      throw fail(
        "EXPORT",
        "This browser cannot prepare the profile photo."
      );

    }

    const viewSize =
      Number(crop.viewSize);

    const outputSize =
      Number(crop.outputSize) || 512;

    if (
      !Number.isFinite(viewSize) ||
      viewSize < 1 ||
      !image.naturalWidth ||
      !image.naturalHeight
    ) {

      throw fail(
        "EXPORT",
        "This photo could not be prepared."
      );

    }

    const fitted =
      fitCrop(
        image.naturalWidth,
        image.naturalHeight,
        viewSize,
        crop.zoom,
        crop.offsetX,
        crop.offsetY
      );

    const ratio =
      outputSize / viewSize;

    const canvas =
      document.createElement("canvas");

    canvas.width =
      outputSize;

    canvas.height =
      outputSize;

    const context =
      canvas.getContext("2d");

    context.drawImage(
      image,
      fitted.offsetX * ratio,
      fitted.offsetY * ratio,
      fitted.drawWidth * ratio,
      fitted.drawHeight * ratio
    );

    const qualities = [
      0.86,
      0.72,
      0.58
    ];

    for (let index = 0; index < qualities.length; index += 1) {

      const blob =
        await blobFrom(
          canvas,
          "image/webp",
          qualities[index]
        );

      if (
        blob &&
        blob.type === "image/webp" &&
        blob.size > 0 &&
        blob.size <= MAX_OUTPUT_BYTES
      ) {

        return blob;

      }

    }

    throw fail(
      "EXPORT",
      "Could not prepare a profile photo under 5 MB."
    );

  }


  async function uploadAvatar(
    client,
    userId,
    blob,
    supabaseUrl
  ) {

    const path =
      objectPath(userId);

    const canonical =
      publicObjectUrl(
        supabaseUrl,
        userId
      );

    if (
      !client ||
      !path ||
      !canonical
    ) {

      throw fail(
        "PATH",
        "Sign in again before changing your photo."
      );

    }

    if (
      !blob ||
      blob.type !== "image/webp" ||
      blob.size < 1 ||
      blob.size > MAX_OUTPUT_BYTES
    ) {

      throw fail(
        "TYPE",
        "Profile photo must be a WEBP image under 5 MB."
      );

    }

    const uploaded =
      await client.storage
        .from(BUCKET)
        .upload(
          path,
          blob,
          {
            cacheControl: "60",
            upsert: true,
            contentType: "image/webp"
          }
        );

    if (uploaded.error) {

      throw uploaded.error;

    }

    const published =
      client.storage
        .from(BUCKET)
        .getPublicUrl(path);

    const reported =
      published &&
      published.data &&
      published.data.publicUrl
        ? String(published.data.publicUrl).split("?")[0]
        : "";

    if (reported !== canonical) {

      await client.storage
        .from(BUCKET)
        .remove([path]);

      throw fail(
        "URL",
        "Profile photo URL did not match this account."
      );

    }

    const versioned =
      canonical + "?v=" + Date.now();

    const saved =
      await client
        .from("profiles")
        .update({
          avatar_url: versioned
        })
        .eq(
          "id",
          normalizeUserId(userId)
        );

    if (saved.error || !saved.data || !saved.data.length) {

      await client.storage
        .from(BUCKET)
        .remove([path]);

      if (saved.error) {

        throw saved.error;

      }

      throw fail(
        "PROFILE",
        "Your profile row could not be updated."
      );

    }

    return versioned;

  }


  async function removeAvatar(
    client,
    userId
  ) {

    const path =
      objectPath(userId);

    if (
      !client ||
      !path
    ) {

      throw fail(
        "PATH",
        "Sign in again before removing your photo."
      );

    }

    const removed =
      await client.storage
        .from(BUCKET)
        .remove([path]);

    if (removed.error) {

      const status =
        String(
          removed.error.statusCode ||
          removed.error.status ||
          ""
        );

      if (status !== "404") {

        throw removed.error;

      }

    }

    const saved =
      await client
        .from("profiles")
        .update({
          avatar_url: null
        })
        .eq(
          "id",
          normalizeUserId(userId)
        );

    if (saved.error) {

      throw saved.error;

    }

    if (
      !saved.data ||
      !saved.data.length
    ) {

      throw fail(
        "PROFILE",
        "Your profile row could not be updated."
      );

    }

  }


  async function readOwnAvatar(
    client,
    userId,
    supabaseUrl
  ) {

    const id =
      normalizeUserId(userId);

    if (
      !client ||
      !id
    ) {

      return "";

    }

    const result =
      await client
        .from("profiles")
        .select("avatar_url")
        .eq("id", id)
        .maybeSingle();

    if (result.error) {

      throw result.error;

    }

    const url =
      result.data &&
      result.data.avatar_url;

    if (
      isOwnAvatarUrl(
        url,
        supabaseUrl,
        id
      )
    ) {

      return url;

    }

    return "";

  }


  function mount(
    element,
    options
  ) {

    if (!element) {

      return;

    }

    const settings =
      options || {};

    const letter =
      initialLetter(settings.name);

    element.textContent =
      "";

    element.style.overflow =
      "hidden";

    const fallback =
      document.createElement("span");

    fallback.textContent =
      letter;

    fallback.style.cssText =
      "display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-weight:800;";

    element.appendChild(fallback);

    const url =
      publicObjectUrl(
        settings.supabaseUrl,
        settings.userId
      );

    if (!url) {

      return;

    }

    const image =
      new Image();

    image.alt =
      "Profile photo";

    image.style.cssText =
      "width:100%;height:100%;object-fit:cover;display:block;";

    image.onload =
      function () {

        fallback.style.display =
          "none";

        element.appendChild(image);

      };

    image.src =
      url;

  }


  return {
    BUCKET: BUCKET,
    FILE_NAME: FILE_NAME,
    MAX_SOURCE_BYTES: MAX_SOURCE_BYTES,
    MAX_OUTPUT_BYTES: MAX_OUTPUT_BYTES,
    objectPath: objectPath,
    publicObjectUrl: publicObjectUrl,
    isOwnAvatarUrl: isOwnAvatarUrl,
    initialLetter: initialLetter,
    acceptsSource: acceptsSource,
    assertSource: assertSource,
    initialCrop: initialCrop,
    fitCrop: fitCrop,
    zoomOffset: zoomOffset,
    exportWebp: exportWebp,
    uploadAvatar: uploadAvatar,
    removeAvatar: removeAvatar,
    readOwnAvatar: readOwnAvatar,
    mount: mount
  };

});
