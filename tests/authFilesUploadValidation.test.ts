import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_UPLOAD_ACCEPT,
  isAuthUploadAllowedFile,
  isAuthUploadArchiveFile,
  isAuthUploadJsonFile,
  maxAuthUploadFileSize,
} from '../src/features/authFiles/uploadValidation.ts';
import { MAX_AUTH_ARCHIVE_SIZE, MAX_AUTH_FILE_SIZE } from '../src/utils/constants.ts';

test('auth upload accept includes json and archive extensions', () => {
  assert.match(AUTH_UPLOAD_ACCEPT, /\.json/);
  assert.match(AUTH_UPLOAD_ACCEPT, /\.zip/);
  assert.match(AUTH_UPLOAD_ACCEPT, /\.tar/);
  assert.match(AUTH_UPLOAD_ACCEPT, /\.tar\.gz/);
  assert.match(AUTH_UPLOAD_ACCEPT, /\.tgz/);
});

test('auth upload file type detection', () => {
  assert.equal(isAuthUploadJsonFile('alpha.json'), true);
  assert.equal(isAuthUploadJsonFile('alpha.JSON'), true);
  assert.equal(isAuthUploadArchiveFile('bundle.zip'), true);
  assert.equal(isAuthUploadArchiveFile('bundle.tar'), true);
  assert.equal(isAuthUploadArchiveFile('bundle.tar.gz'), true);
  assert.equal(isAuthUploadArchiveFile('bundle.tgz'), true);
  assert.equal(isAuthUploadAllowedFile('notes.txt'), false);
  assert.equal(isAuthUploadAllowedFile('bundle.7z'), false);
  assert.equal(isAuthUploadAllowedFile('nested/alpha.json'), true);
});

test('auth upload size caps differ for json vs archive', () => {
  assert.equal(maxAuthUploadFileSize('a.json'), MAX_AUTH_FILE_SIZE);
  assert.equal(maxAuthUploadFileSize('a.zip'), MAX_AUTH_ARCHIVE_SIZE);
  assert.equal(maxAuthUploadFileSize('a.tar.gz'), MAX_AUTH_ARCHIVE_SIZE);
});
