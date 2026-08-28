/**
 *
 * (c) Copyright Ascensio System SIA 2026
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { FormFillingManageAction } from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

/**
 * Resolves the caller's "My Documents" root folder ID.
 */
export async function getMyDocsFolderId(
  api: ReturnType<ApiSDK["forRole"]>,
): Promise<number> {
  const { data } = await api.folders.getMyFolder();
  return data.response!.current!.id!;
}

/**
 * Uploads the shared oo-form-empty.pdf asset into a room and starts form
 * filling on it.
 *
 * @returns File ID of the uploaded form
 */
export async function startFormFilling(
  apiSdk: ApiSDK,
  role: Role,
  roomId: number,
): Promise<number> {
  const buffer = readFileSync(
    path.join(__dirname, "../assets/oo-form-empty.pdf"),
  );
  const { data: insertData } = await apiSdk.insertBinaryFile(
    role,
    roomId,
    buffer,
    "oo-form-empty.pdf",
  );
  const formId = insertData.response.id as number;

  await apiSdk.forRole(role).files.manageFormFilling({
    fileId: String(formId),
    manageFormFillingDtoInteger: {
      formId,
      action: FormFillingManageAction.Start,
    },
  });

  return formId;
}

/**
 * Creates an ONLYOFFICE PDF form in the specified folder.
 *
 * Chain: .docx (My Documents) -> copyFileAs(toForm:true) -> .docxf -> copyFileAs(toForm:true, .pdf) -> PDF form
 *
 * @param api - Authenticated role API from apiSdk.forRole(role)
 * @param folderId - Target folder ID where the PDF form will be created
 * @returns File ID of the created ONLYOFFICE PDF form
 */
export async function createOoForm(
  api: ReturnType<ApiSDK["forRole"]>,
  folderId: number,
): Promise<number> {
  const { data: myDocsData } = await api.folders.getMyFolder();
  const myDocsFolderId = myDocsData.response!.current!.id!;

  const { data: docxData } = await api.files.createFileInMyDocuments({
    createFileJsonElement: { title: "Autotest OO Form Source.docx" },
  });
  const docxId = docxData.response!.id!;

  const { data: docxfData } = await api.files.copyFileAs({
    fileId: docxId,
    copyAsJsonElement: {
      destTitle: "Autotest OO Form Template.docxf",
      destFolderId: myDocsFolderId,
      toForm: true,
    },
  });
  const docxfId = (docxfData.response as any).id as number;

  const { data: pdfFormData } = await api.files.copyFileAs({
    fileId: docxfId,
    copyAsJsonElement: {
      destTitle: "Autotest OO Form.pdf",
      destFolderId: folderId,
      toForm: true,
    },
  });

  return (pdfFormData.response as any).id as number;
}
