import arg from "arg";
import process from "node:process";
import { config } from "../lib/config";
import { QiitaItem } from "../lib/entities/qiita-item";
import { getFileSystemRepo } from "../lib/get-file-system-repo";
import { syncArticlesFromQiita } from "../lib/sync-articles-from-qiita";
import { validateItem } from "../lib/validators/item-validator";
import { Item, QiitaApi } from "../qiita-api";

export const publish = async (argv: string[]) => {
  const args = arg(
    {
      "--all": Boolean,
    },
    { argv }
  );

  const { accessToken } = await config.getCredential();

  const qiitaApi = new QiitaApi({
    token: accessToken,
  });
  const fileSystemRepo = await getFileSystemRepo();

  await syncArticlesFromQiita({ fileSystemRepo, qiitaApi });

  let targetItems: QiitaItem[];
  if (args["--all"]) {
    targetItems = (await fileSystemRepo.loadItems()).filter((item) => {
      return item.modified || item.id === null;
    });
  } else {
    const items = [];
    for (const basename of args._) {
      const item = await fileSystemRepo.loadItemByBasename(basename);
      if (item === null) {
        console.error(`Error: '${basename}' is not found`);
        process.exit(1);
      }
      items.push(item);
    }
    targetItems = items;
  }

  // Validate
  const invalidItemMessages = targetItems.reduce((acc, item) => {
    const errors = validateItem(item);
    if (errors.length > 0) return [...acc, { name: item.name, errors }];
    else return acc;
  }, [] as { name: string; errors: string[] }[]);
  if (invalidItemMessages.length > 0) {
    console.error("Validation error:");
    invalidItemMessages.forEach((msg) => {
      console.error(msg.name, msg.errors);
      targetItems = targetItems.filter((item) => item.name !== msg.name);
    });
  }

  if (targetItems.length === 0) {
    console.log("Nothing to publish");
    process.exit(0);
  }

  const promises = targetItems.map(async (item) => {
    let responseItem: Item;
    if (item.id) {
      responseItem = await qiitaApi.patchItem({
        rawBody: item.rawBody,
        tags: item.tags,
        title: item.title,
        uuid: item.id,
        isPrivate: item.secret,
        organizationUrlName: item.organizationUrlName,
      });

      console.log(`Updated: ${item.name} -> ${item.id}`);
    } else {
      responseItem = await qiitaApi.postItem({
        rawBody: item.rawBody,
        tags: item.tags,
        title: item.title,
        isPrivate: item.secret,
        organizationUrlName: item.organizationUrlName,
      });
      fileSystemRepo.updateItemUuid(item.name, responseItem.id);

      console.log(`Posted: ${item.name} -> ${responseItem.id}`);
    }

    await fileSystemRepo.saveItem(responseItem, false, true);
  });

  await Promise.all(promises);
  console.log("Successful!");
};
