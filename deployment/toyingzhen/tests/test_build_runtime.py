import hashlib,importlib.util,json,os,pathlib,tempfile,unittest,zipfile
P=pathlib.Path(__file__).parents[1]/'build.py'
spec=importlib.util.spec_from_file_location('build',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RuntimeTests(unittest.TestCase):
 def test_distribution_checks_archive_and_extracted_bytes_without_bootstrap(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);home=root/'apache-maven-3.9.11';(home/'bin').mkdir(parents=True);(home/'bin/m2.conf').write_bytes(b'config');archive=root/'apache-maven-3.9.11-bin.zip'
   with zipfile.ZipFile(archive,'w') as z:z.writestr('apache-maven-3.9.11/bin/m2.conf',b'config')
   expected=hashlib.sha512(archive.read_bytes()).hexdigest();m.verify_maven_distribution(home,expected)
   (home/'bin/m2.conf').write_bytes(b'tampered')
   with self.assertRaises(ValueError):m.verify_maven_distribution(home,expected)
   with self.assertRaises(ValueError):m.verify_maven_distribution(home,'0'*128)
 def test_maven_launch_uses_explicit_java_and_installed_home(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);home=p/'maven';(home/'boot').mkdir(parents=True);(home/'boot/plexus-classworlds-2.9.0.jar').write_bytes(b'jar');java=p/'jdk/bin/java.exe';source=p/'frozen source'
   args=m.maven_command(java,home,source,['--version'])
   self.assertEqual(args[0],str(java));self.assertIn('-Dmaven.home='+str(home),args);self.assertIn('-Dmaven.multiModuleProjectDirectory='+str(source),args)
   self.assertEqual(args[-2:],['org.codehaus.plexus.classworlds.launcher.Launcher','--version']);self.assertFalse(any('powershell' in x or 'mvnw' in x for x in args))
 def test_runtime_path_deterministic_and_injection_flags_removed(self):
  p=pathlib.Path('runtime');env=m.runtime_environment(p/'node/node.exe',p/'jdk',p/'maven',{'PATH':'previous','JAVA_TOOL_OPTIONS':'injected','NODE_OPTIONS':'injected'})
  self.assertEqual(env['JAVA_HOME'],str(p/'jdk'));self.assertTrue(env['PATH'].startswith(str(p/'node')+os.pathsep+str(p/'jdk/bin')))
  self.assertNotIn('JAVA_TOOL_OPTIONS',env);self.assertNotIn('NODE_OPTIONS',env)
 def test_wrong_runtime_versions_fail(self):
  m.validate_versions('openjdk version "21.0.12.1"','v24.19.0','Apache Maven 3.9.11')
  for values in [('openjdk version "17.0.1"','v24.19.0','Apache Maven 3.9.11'),('openjdk version "21.0.1"','v18.1.0','Apache Maven 3.9.11'),('openjdk version "21.0.1"','v24.19.0','Apache Maven 3.9.10')]:
   with self.assertRaises(ValueError):m.validate_versions(*values)
if __name__=='__main__':unittest.main()
