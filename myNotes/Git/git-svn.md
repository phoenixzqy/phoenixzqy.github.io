# Tracking and contributing to the trunk of a Subversion-managed project:

```bash
# Clone a repo (like git clone):
  git svn clone http://svn.example.com/project/trunk
# Enter the newly cloned directory:
  cd trunk
# You should be on master branch, double-check with 'git branch'
  git branch
# Do some work and commit locally to git:
  git commit ...
# Something is committed to SVN, rebase your local changes against the
# latest changes in SVN:
  git svn rebase
# Now commit your changes (that were committed previously using git) to SVN,
# as well as automatically updating your working HEAD:
  git svn dcommit
# Append svn:ignore settings to the default git exclude file:
  git svn show-ignore >> .git/info/exclude

Tracking and contributing to an entire Subversion-managed project (complete with a trunk, tags and branches):

# Clone a repo (like git clone):
  git svn clone http://svn.example.com/project -T trunk -b branches -t tags
# View all branches and tags you have cloned:
  git branch -r
# Create a new branch in SVN
  git svn branch waldo
# Reset your master to trunk (or any other branch, replacing 'trunk'
# with the appropriate name):
  git reset --hard remotes/trunk
# You may only dcommit to one branch/tag/trunk at a time.  The usage
# of dcommit/rebase/show-ignore should be the same as above.
```