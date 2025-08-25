/**
 * Notes Service PR mock data - Refactor notes query system with proper relationships
 * Used for testing holistic analysis on database relationship improvements and query optimization
 */

module.exports = {
  title: "Refactor notes service: Replace string matching with proper database relationships",
  description: "This PR refactors the notes service to use proper database relationships instead of string matching for better performance and accuracy. Changes include adding NoteAgentMap associations, updating method signatures to include profile_type parameter, replacing ILIKE queries with JOIN operations, simplifying utility functions, and updating all callers to provide the new required parameter.",
  files: [
    {
      filename: "packages/@libs/db-entities/src/schemas/vw/notes.ts",
      status: "modified",
      additions: 7,
      deletions: 0,
      patch: `@@ -3,6 +3,7 @@ import { GraphQLObjectType } from 'graphql';
 import { connection as sequelize } from '../../connection';
 import * as entityTranslator from '@purepm/comms-library';
 import { getObjectTypeDefinitionNode, toPascalCase, pKey } from '../../common';
+import { NoteAgentMap } from '../core/noteAgentMap';
 
 export class NotesAttributes {
   static tableName = 'get_notes';
@@ -36,3 +37,9 @@ Notes.init(entityTranslator.sequelizeGenerator.createModel(NotesAttributes), {
   schema: NotesAttributes.schema,
   modelName: NotesAttributes.tableName,
 });
+
+Notes.hasMany(NoteAgentMap, {
+  foreignKey: 'note_id',
+  sourceKey: 'note_id',
+  as: 'note_agent_map',
+});`
    },
    {
      filename: "packages/@services/core-service/src/helpers/hardDeleteNotes.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: `@@ -7,7 +7,7 @@ const noteService: NoteService = new NoteService();
 const noteAgentMapService: NoteAgentMapService = new NoteAgentMapService();
 
 export const hardDeleteNotes = async (profileId: Identifier, profileIdType: ConnectedProfilesNotes) => {
-  const actualProfileNotes: INoteJSON[] = await noteService.getNotesByProfileId(profileId, true);
+  const actualProfileNotes: INoteJSON[] = await noteService.getNotesByProfileId(profileId, profileIdType, true);
   await noteAgentMapService.hardDeleteProfileNotesConnectedProfile(profileId, profileIdType);
   const noteIdList = [];`
    },
    {
      filename: "packages/@services/core-service/src/note/noteController.ts",
      status: "modified",
      additions: 4,
      deletions: 2,
      patch: `@@ -2,7 +2,7 @@ import { Logger } from '@purepm/common-utils';
 import { AnyRequiredRolesOrPermissions } from '@purepm/common';
 import { connection, Identifier, NoteGQLType, NoteAgentMap } from '@purepm/db-entities';
 import { ApolloServerErrorCode } from '@apollo/server/errors';
-import { GraphQLBoolean, GraphQLError, GraphQLID, GraphQLList, GraphQLNonNull } from 'graphql';
+import { GraphQLBoolean, GraphQLError, GraphQLID, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
 import { isNil } from 'lodash';
 import { BrandService } from '../brand';
 import { NoteAgentMapService } from '../noteAgentMap';
@@ -20,7 +20,7 @@ import {
 import { AllRoles, ConnectedProfilesNotes, IUserInfo, PEC3002, AllPermissions } from '@purepm/purepm-lovs';
 import { publishBuildingUpdateMessage, updatePublishDoorMessage } from '@purepm/orchestration';
 import { validateUpsertNote } from './noteUtils';
-import { catcher } from '@purepm/gql-common';
+import { catcher, GraphQLStringUUID } from '@purepm/gql-common';
 export class NoteController {
   noteService: NoteService;
   noteAgentMapService: NoteAgentMapService;
@@ -40,7 +40,7 @@ export class NoteController {
     return {
       getNotesByProfileId: {
         type: new GraphQLList(NoteGQL),
-        args: { profile_id: { type: new GraphQLNonNull(GraphQLID) } },
+        args: { profile_id: { type: new GraphQLNonNull(GraphQLStringUUID) }, profile_type: { type: GraphQLString } },
         resolve: this.getNotesByProfileId.bind(this),
       },
     };
@@ -228,7 +228,7 @@ export class NoteController {
   @AnyRequiredRolesOrPermissions([AllRoles.CORE_USER, AllRoles.CORE_LIMITED], [AllPermissions.CORE_FULL_E2E])
   async getNotesByProfileId(_: null, input: NotesGetInput) {
     try {
-      return await this.noteService.getNotesByProfileId(input.profile_id, true);
+      return await this.noteService.getNotesByProfileId(input.profile_id, input.profile_type, true);
     } catch (err) {
       Logger.error(\`Error on Notes Controller: \${(err as Error).message}\`);
       throw new GraphQLError(`
    },
    {
      filename: "packages/@services/core-service/src/note/noteService.ts",
      status: "modified",
      additions: 25,
      deletions: 32,
      patch: `@@ -1,23 +1,16 @@
-import {
-  Identifier,
-  Note,
-  Notes,
-  Op,
-  NotesAttributes,
-  connection as sequelize,
-  NoteJSON as DBNoteJSON,
-} from '@purepm/db-entities';
-import type { INoteJSON } from '@purepm/purepm-lovs';
-import { ICustomFindOptions } from '@purepm/common';
+import { Identifier, Note, Notes, NoteAgentMap, NoteJSON as DBNoteJSON } from '@purepm/db-entities';
+import type { INoteJSON, ConnectedProfilesNotes } from '@purepm/purepm-lovs';
 import { unifyConnectedProfiles } from './noteUtils';
 import { NoteUpsertInput } from './types';
 
 export class NoteService {
   readonly noteEntity;
   readonly notesViewEntity;
+  readonly noteAgentMapEntity;
   constructor() {
     this.noteEntity = Note;
     this.notesViewEntity = Notes;
+    this.noteAgentMapEntity = NoteAgentMap;
   }
 
   hardDeleteNote(noteId: Identifier | Identifier[]) {
@@ -71,30 +64,42 @@ export class NoteService {
     }
   }
 
-  async getNotesByProfileId(profileId: Identifier, hasConnectedProfilesUnified: boolean): Promise<INoteJSON[]> {
-    const options: ICustomFindOptions = {
+  async getNotesByProfileId(
+    profileId: Identifier,
+    profileType: ConnectedProfilesNotes,
+    hasConnectedProfilesUnified: boolean,
+  ): Promise<INoteJSON[]> {
+    const notesResult = await this.notesViewEntity.findAll({
+      include: [
+        {
+          model: NoteAgentMap,
+          as: 'note_agent_map',
+          attributes: ['note_id', 'active', profileType],
+          where: {
+            [profileType]: profileId,
+            active: true,
+          },
+          required: true,
+        },
+      ],
       order: [
         ['created_date', 'DESC'],
         ['updated_date', 'DESC'],
       ],
-      where: sequelize.where(sequelize.cast(sequelize.col('connected_profiles'), 'text'), {
-        [Op.iLike]: \`%\${profileId}%\`,
-      }),
-      modelName: NotesAttributes.tableName,
-    };
-    const notesResult = await this.notesViewEntity.findAll(options);
-    return notesResult
-      .map((note: Notes) => {
-        const noteJson = note.toJSON();
-        if (hasConnectedProfilesUnified) {
-          const cleanProfiles = unifyConnectedProfiles(noteJson.connected_profiles, profileId);
-
-          if (!cleanProfiles.length) return null;
+    });
 
+    return notesResult.reduce((acc: INoteJSON[], note: Notes) => {
+      const noteJson = note.toJSON();
+      if (hasConnectedProfilesUnified) {
+        const cleanProfiles = unifyConnectedProfiles(noteJson.connected_profiles);
+        if (cleanProfiles.length) {
           noteJson.connected_profiles = cleanProfiles;
+          acc.push(noteJson);
         }
-        return noteJson;
-      })
-      .filter((note: INoteJSON) => note);
+      } else {
+        acc.push(noteJson);
+      }
+      return acc;
+    }, []);
   }
 }`
    },
    {
      filename: "packages/@services/core-service/src/note/noteUtils.ts",
      status: "modified",
      additions: 6,
      deletions: 28,
      patch: `@@ -11,21 +11,6 @@ import {
 import { ConnectedProfilesNoteInput, INoteUpsertSendPubSubMsgInput } from './types';
 import { PureError } from '@purepm/common';
 
-const isNoteProfileInactive = (profile: IPartialConnectedProfile, profileId: Identifier) => {
-  return (
-    !profile.active &&
-    (profile.door_id === profileId ||
-      profile.lease_id === profileId ||
-      profile.vendor_id === profileId ||
-      profile.person_id === profileId ||
-      profile.owner_id === profileId ||
-      profile.ownership_group_id === profileId ||
-      profile.building_id === profileId ||
-      profile.application_person_id === profileId ||
-      profile.application_id === profileId)
-  );
-};
-
 function getAddress(address1?: string, address2?: string) {
   return [address1, address2].filter(address => address).join(',');
 }
@@ -137,34 +122,12 @@ export const validateUpsertNote = (note: INoteUpsertSendPubSubMsgInput) => {
   validateConnectedProfiles(connectedProfiles);
 };
 
-export const unifyConnectedProfiles = (
-  connectedProfilesjson: IConnectedProfilesJson,
-  profileId: Identifier,
-): IConnectedProfilesNote[] => {
-  const connectedProfiles: IConnectedProfilesNote[] = [];
-
-  for (const connectedProfile in connectedProfilesjson) {
-    for (const profile of connectedProfilesjson[connectedProfile as keyof IConnectedProfilesJson]) {
-      /**
-       * If the profile is not active and the profile id
-       * matches the given id to search it means that the
-       * note does not belong to that profile and so we
-       * must not show it.
-       */
-      if (isNoteProfileInactive(profile, profileId)) {
-        return [];
-      }
-
-      /**
-       * Return only the profiles with an active status
-       */
-      if (profile.active) {
-        const sortedProfile = sortProfile(profile, connectedProfile);
-
-        connectedProfiles.push({ ...sortedProfile });
-      }
-    }
-  }
-
-  return connectedProfiles;
+export const unifyConnectedProfiles = (connectedProfilesJSON: IConnectedProfilesJson): IConnectedProfilesNote[] => {
+  return Object.entries(connectedProfilesJSON).flatMap(([connectedProfileKey, profiles]) =>
+    profiles
+      .filter((profile: IPartialConnectedProfile) => profile.active)
+      .map((profile: IPartialConnectedProfile) =>
+        sortProfile(profile, connectedProfileKey as keyof IConnectedProfilesJson),
+      ),
+  );
 };`
    },
    {
      filename: "packages/@services/core-service/src/note/types.ts",
      status: "modified",
      additions: 1,
      deletions: 0,
      patch: `@@ -51,6 +51,7 @@ export type NoteAgentRequiredInsertInput = {
 
 export interface NotesGetInput {
   profile_id: Identifier;
+  profile_type: ConnectedProfilesNotes;
   page: number;
   count: number;
 }`
    },
    {
      filename: "packages/@services/core-service/src/owner/ownerTransactionManager.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: `@@ -102,7 +102,7 @@ export class OwnerTransactionManager {
   }
 
   async hardDeleteNotes(profileId: Identifier, profileIdType: ConnectedProfilesNotes) {
-    const actualProfileNotes: INoteJSON[] = await this.noteService.getNotesByProfileId(profileId, true);
+    const actualProfileNotes: INoteJSON[] = await this.noteService.getNotesByProfileId(profileId, profileIdType, true);
     await this.noteAgentMapService.hardDeleteProfileNotesConnectedProfile(profileId, profileIdType);
     const noteIdList = [];`
    },
    {
      filename: "packages/@services/core-service/src/vendor/vendorController.ts",
      status: "modified",
      additions: 6,
      deletions: 1,
      patch: `@@ -14,6 +14,7 @@ import {
   AllPermissions,
   IPhoneBasicInfo,
   IVendorPhoneInputType,
+  ConnectedProfilesNotes,
 } from '@purepm/purepm-lovs';
 import {
   Identifier,
@@ -336,7 +337,11 @@ export class VendorController {
   }
 
   private async deleteVendorNotes(vendorId: Identifier) {
-    const actualVendorNotes: INoteJSON[] = await this.noteService.getNotesByProfileId(vendorId, false);
+    const actualVendorNotes: INoteJSON[] = await this.noteService.getNotesByProfileId(
+      vendorId,
+      ConnectedProfilesNotes.VENDOR_ID,
+      false,
+    );
     await this.noteAgentMapService.hardDeleteVendorNotesConnectedProfile(vendorId);
     const vendorNotesIdList = [];
     for (const note of actualVendorNotes) {`
    }
  ],
  commitMessages: [
    "feat: add NoteAgentMap relationship to Notes entity for proper database associations",
    "refactor: replace string matching with JOIN-based queries in getNotesByProfileId",
    "feat: add profile_type parameter to support different entity types in note queries",
    "refactor: simplify unifyConnectedProfiles utility function using modern array methods",
    "fix: update GraphQL schema to use proper UUID type and add profile_type argument",
    "refactor: remove unused imports and simplify NoteService constructor",
    "fix: update all callers to provide required profile_type parameter",
    "perf: replace ILIKE string matching with proper database relationships for better performance"
  ]
};