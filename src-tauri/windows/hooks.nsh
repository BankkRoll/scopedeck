; Scopedeck installer hooks, included by the NSIS template (bundle > windows >
; nsis > installerHooks). The template removes %APPDATA%\<identifier> and
; %LOCALAPPDATA%\<identifier> when the user asks to remove their data. These
; hooks add what the template can't see: the secrets Scopedeck keeps in
; Windows Credential Manager.
;
; Every step is best effort. A missing entry must never block an uninstall, so
; exit codes are popped and ignored.

!macro NSIS_HOOK_PREUNINSTALL
  ; NOTE: runs before the program files are deleted, because only the app knows
  ; how its keychain entries are named. The flag deletes them and exits without
  ; opening a window. Updates never remove data.
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
  ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    DetailPrint "Removing the API token and AI key from Windows Credential Manager"
    nsExec::Exec '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-credentials'
    Pop $0
  ${EndIf}
!macroend
