'use strict';

const uuid = require('uuid/v4');
const { trimChars, trimCharsEnd, trimCharsStart, keys, sortBy, omit } = require('lodash/fp');

// TODO: to use once https://github.com/strapi/strapi/pull/12534 is merged
// const { joinBy } = require('@strapi/utils');

const folderModel = 'plugin::upload.folder';

const joinBy = (joint, ...args) => {
  const trim = trimChars(joint);
  const trimEnd = trimCharsEnd(joint);
  const trimStart = trimCharsStart(joint);

  return args.reduce((url, path, index) => {
    if (args.length === 1) return path;
    if (index === 0) return trimEnd(path);
    if (index === args.length - 1) return url + joint + trimStart(path);
    return url + joint + trim(path);
  }, '');
};

const generateUID = () => uuid();

const setLocationAndUID = async folder => {
  const uid = generateUID();
  let parentLocation = '/';
  if (folder.parent) {
    const parentFolder = await strapi.entityService.findOne(folderModel, folder.parent);
    parentLocation = parentFolder.location;
  }

  return Object.assign(folder, {
    uid,
    location: joinBy('/', parentLocation, uid),
  });
};

const deleteByIds = async ids => {
  const deletedFolders = [];
  for (const id of ids) {
    const deletedFolder = await strapi.entityService.delete(folderModel, id);

    deletedFolders.push(deletedFolder);
  }

  return deletedFolders;
};

/**
 * Check if a folder exists in database
 * @param params query params to find the folder
 * @returns {Promise<boolean>}
 */
const exists = async (params = {}) => {
  const count = await strapi.query(folderModel).count({ where: params });
  return count > 0;
};

const getTree = async () => {
  const joinTable = strapi.db.metadata.get('plugin::upload.folder').attributes.parent.joinTable;
  const qb = strapi.db.queryBuilder('plugin::upload.folder');
  const alias = qb.getAlias();
  const folders = await qb
    .select(['id', 'name', `${alias}.${joinTable.inverseJoinColumn.name} as parent`])
    .join({
      alias,
      referencedTable: joinTable.name,
      referencedColumn: joinTable.joinColumn.name,
      rootColumn: joinTable.joinColumn.referencedColumn,
      rootTable: qb.alias,
    })
    .execute({ mapResults: false });

  const folderMap = folders.reduce((map, f) => {
    f.children = [];
    map[f.id] = f;
    return map;
  }, {});
  folderMap.null = { children: [] };

  for (const id of keys(omit('null', folderMap))) {
    const parentId = folderMap[id].parent;
    folderMap[parentId].children.push(folderMap[id]);
    folderMap[parentId].children = sortBy('name', folderMap[parentId].children);
    delete folderMap[id].parent;
  }

  return folderMap.null.children;
};

module.exports = {
  exists,
  deleteByIds,
  setLocationAndUID,
  getTree,
};
