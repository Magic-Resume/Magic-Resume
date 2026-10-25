import {
  CompositeBackend,
  FilesystemBackend,
  StateBackend,
  type WriteResult,
  type EditResult,
  type DeleteResult,
  type FileUploadResponse,
} from 'deepagents';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import {
  RESUME_PATH,
  SKILLS_MOUNT,
  applyEdit,
  validateResume,
  rawContent,
  normalizePath,
} from './files.js';
import type { AgentMode } from '../prompts/instructions.js';
import { SEARCH_SKILLS } from '../skills/catalog.js';

class ReadonlySkills extends FilesystemBackend {
  constructor(
    skillsDir: string,
    private readonly searchEnabled: boolean,
  ) {
    super({ rootDir: skillsDir, virtualMode: true });
  }
  private visible(path: string) {
    return (
      this.searchEnabled ||
      !SEARCH_SKILLS.has(normalizePath(path).split('/')[1])
    );
  }
  override async ls(path: string) {
    if (!this.visible(path)) return { error: 'Skill unavailable.' };
    const result = await super.ls(path);
    return {
      ...result,
      files: result.files?.filter((file) => this.visible(file.path)),
    };
  }
  override async read(path: string, offset?: number, limit?: number) {
    return this.visible(path)
      ? super.read(path, offset, limit)
      : { error: 'Skill unavailable.' };
  }
  override async readRaw(path: string) {
    return this.visible(path)
      ? super.readRaw(path)
      : { error: 'Skill unavailable.' };
  }
  override async glob(pattern: string, path?: string) {
    if (path && !this.visible(path)) return { error: 'Skill unavailable.' };
    const result = await super.glob(pattern, path);
    return {
      ...result,
      files: result.files?.filter((file) => this.visible(file.path)),
    };
  }
  override async grep(...args: Parameters<FilesystemBackend['grep']>) {
    if (args[1] && !this.visible(args[1]))
      return { error: 'Skill unavailable.' };
    const result = await super.grep(...args);
    return {
      ...result,
      matches: result.matches?.filter((match) => this.visible(match.path)),
    };
  }
  override async downloadFiles(paths: string[]) {
    return Promise.all(
      paths.map(async (path) =>
        this.visible(path)
          ? (await super.downloadFiles([path]))[0]
          : { path, content: null, error: 'file_not_found' as const },
      ),
    );
  }
  override async write(): Promise<WriteResult> {
    return { error: 'The skill mount is read-only.' };
  }
  override async edit(): Promise<EditResult> {
    return { error: 'The skill mount is read-only.' };
  }
  override async delete(): Promise<DeleteResult> {
    return { error: 'The skill mount is read-only.' };
  }
  override async uploadFiles(
    files: Array<[string, Uint8Array]>,
  ): Promise<FileUploadResponse[]> {
    return files.map(([path]) => ({ path, error: 'permission_denied' }));
  }
}
/** StateBackend keeps draft files in graph state; the disk route contains only shipped skills. */
export class WorkspaceBackend extends CompositeBackend {
  constructor(
    skillsDir: string,
    private readonly mode: AgentMode,
    searchEnabled = false,
  ) {
    super(new StateBackend(), {
      [SKILLS_MOUNT]: new ReadonlySkills(skillsDir, searchEnabled),
    });
  }
  override async delete(rawPath: string): Promise<DeleteResult> {
    const path = normalizePath(rawPath);
    if (
      path === '/' ||
      path === '/workspace' ||
      path === RESUME_PATH ||
      path === '/skills' ||
      path.startsWith(SKILLS_MOUNT)
    )
      return { error: 'Protected workspace sources cannot be deleted.' };
    return super.delete(path);
  }
  override async write(rawPath: string, content: string): Promise<WriteResult> {
    const path = normalizePath(rawPath);
    if (path !== RESUME_PATH) return super.write(path, content);
    if (this.mode !== 'cocreate')
      return { error: 'Resume writes are unavailable in this mode.' };
    const validated = validateResume(content);
    if (validated.error) return { error: validated.error };
    const result = await super.write(path, content);
    if (!result.error)
      await dispatchCustomEvent('resume_file_saved', {
        path,
        resume: validated.resume,
      });
    return result;
  }
  override async edit(
    rawPath: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<EditResult> {
    const path = normalizePath(rawPath);
    if (path !== RESUME_PATH)
      return super.edit(path, oldString, newString, replaceAll);
    if (this.mode !== 'cocreate')
      return { error: 'Resume writes are unavailable in this mode.' };
    const current = await super.readRaw(path);
    const before = rawContent(current.data?.content);
    const after =
      before === undefined
        ? undefined
        : applyEdit(before, oldString, newString, replaceAll);
    if (after === undefined)
      return {
        error:
          'The requested edit does not identify a unique current substring.',
      };
    const validated = validateResume(after);
    if (validated.error) return { error: validated.error };
    const result = await super.edit(path, oldString, newString, replaceAll);
    if (!result.error)
      await dispatchCustomEvent('resume_file_saved', {
        path,
        resume: validated.resume,
      });
    return result;
  }
}
