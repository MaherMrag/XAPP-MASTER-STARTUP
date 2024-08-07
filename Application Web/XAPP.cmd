@ECHO off
GOTO start

:find_dp0
SET dp0=%~dp0
EXIT /b

:start
SETLOCAL
CALL :find_dp0

REM Chemin vers le dossier source
SET sourcePath=%dp0%\XAPP-SERVER-MASTER

REM Vérifier si le dossier node_modules existe dans le dossier source
IF NOT EXIST "%sourcePath%\node_modules" (
  ECHO Les dépendances ne sont pas installées. Installation de npm dependencies...
  CD /D "%sourcePath%"
  npm install
)

REM Lancer l'application après l'installation des dépendances
IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

ECHO Démarrage de l'application...
start "%_prog%" "%_prog%" "%sourcePath%\xapp.js" %*

ENDLOCAL
PAUSE