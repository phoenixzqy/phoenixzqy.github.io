import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from release_notices import notices_text
from release_packages import digest


class ReleaseNoticesTest(unittest.TestCase):
    def fixture(self, root, commit='a' * 40, include_notices=True,
                filename='codex.zip', attribution='Original attribution <script> remains plain text'):
        package=root/filename
        with zipfile.ZipFile(package,'w') as archive:
            archive.writestr('zai-release.json',json.dumps({'commit':commit,'version':'0.1.1'}))
            archive.writestr('LICENSE','Apache license fixture')
            if include_notices:
                archive.writestr('third-party-notices/DEPENDENCIES.txt',attribution)
        return {'appId':'zai-codex','release':{'version':'0.1.1','assets':[
            {'file':package.name,'bytes':package.stat().st_size,'sha256':digest(package)}]}}

    def test_notices_describe_final_release_and_preserve_original_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            data=self.fixture(root)
            text=notices_text(data,root,'a' * 40)
            self.assertIn('zai-codex 0.1.1',text)
            self.assertIn('Original attribution <script> remains plain text',text)
            self.assertIn('Apache license fixture',text)

    def test_identical_notices_are_shared_but_different_attributions_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            original='Original attribution\r\nCopyright first author\r\n'
            different='Original attribution\r\nCopyright second author\r\n'
            data=self.fixture(root,filename='linux.zip',attribution=original)
            for filename, attribution in [('macos.zip',original),('windows.zip',different)]:
                data['release']['assets'].extend(
                    self.fixture(root,filename=filename,attribution=attribution)['release']['assets'])
            text=notices_text(data,root,'a' * 40)
            self.assertEqual(text.count(original),1)
            self.assertEqual(text.count(different),1)
            self.assertEqual(text.count('Apache license fixture'),1)
            self.assertIn('Packages: linux.zip, macos.zip, windows.zip',text)
            self.assertIn('Packages: linux.zip, macos.zip\n\n'+original,text)
            self.assertIn('Packages: windows.zip\n\n'+different,text)

    def test_other_source_and_missing_notice_material_are_rejected(self):
        for kwargs in ({'commit':'b' * 40},{'include_notices':False}):
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                data=self.fixture(root,**kwargs)
                with self.assertRaises(ValueError):
                    notices_text(data,root,'a' * 40)
