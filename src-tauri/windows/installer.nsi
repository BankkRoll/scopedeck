; Scopedeck's NSIS installer template (bundle > windows > nsis > template).
;
; IMPORTANT: forked from tauri-bundler's installer.nsi as of @tauri-apps/cli
; 2.12.5. Sections, the registry layout and every command-line mode (/S, /P,
; /UPDATE, /NS, /R, /ARGS, /D=) are unchanged, because the updater relies on
; them. The interactive pages are Scopedeck's own:
;
;   Installer
;     1. One install page: install, update, reinstall or older-version install,
;        with the location and a desktop shortcut choice. Existing installs are
;        updated in place, the way the updater does it, so the sign-in, drafts
;        and settings are kept.
;     2. Progress.
;     3. Finish, with "Launch Scopedeck" and a link to the release notes.
;
;   Uninstaller
;     1. Confirm, with an opt-in "remove my data" that also deletes the API
;        token and AI key from Windows Credential Manager.
;     2. Progress.
;     3. Finish, saying what was kept or removed.
;
; Additional checks: Windows 10 or later, a 64-bit PC, a second copy of Setup
; is not already running, and the chosen folder is local, writable, outside
; Windows and has room.
;
; Releases up to 0.1.2 also shipped an MSI. A per-machine MSI install found at
; startup is removed before installing, in every mode, so updates and scripted
; installs migrate too.
;
; When upgrading the Tauri CLI, diff the new upstream template against 2.12.5
; and carry over any changes outside the page code.

Unicode true
ManifestDPIAware true
; Add in `dpiAwareness` `PerMonitorV2` to manifest for Windows 10 1607+ (note this should not affect lower versions since they should be able to ignore this and pick up `dpiAware` `true` set by `ManifestDPIAware true`)
; Currently undocumented on NSIS's website but is in the Docs folder of source tree, see
; https://github.com/kichik/nsis/blob/5fc0b87b819a9eec006df4967d08e522ddd651c9/Docs/src/attributes.but#L286-L300
; https://github.com/tauri-apps/tauri/pull/10106
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  ; Set the compression algorithm. We default to LZMA.
  SetCompressor /SOLID "{{compression}}"
!endif

; Keep above !include to stay ahead of any plugin command
; see https://github.com/tauri-apps/tauri/pull/15422#discussion_r3289239624
{{#if signed_plugins_path}}
!addplugindir "{{signed_plugins_path}}"
{{/if}}

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "Win\RestartManager.nsh"
!include WinVer.nsh
!include nsDialogs.nsh
; StrCase and StrLoc are used to find an MSI install by its msiexec uninstaller.
!include "StrFunc.nsh"
${StrCase}
${StrLoc}

{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{/if}}

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define LICENSE "{{license}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define UNINSTALLERICON "{{uninstaller_icon}}"
!define UNINSTALLERHEADERIMAGE "{{uninstaller_header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"
!define STARTMENUFOLDER "{{start_menu_folder}}"

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var WixMode
Var WixKey
Var OldMainBinaryName

; What is already installed: "none", "older" (this installer updates it),
; "same" (reinstall) or "newer" (this installer is older). Set in .onInit so
; it is valid in silent and passive mode too, where no page callback runs.
Var ExistingState
Var ExistingVersion
Var DesktopShortcut
Var HighContrast

Name "${PRODUCTNAME}"
; NOTE: a single space hides the branding line; an empty value would show the
; default "Nullsoft Install System" text instead.
BrandingText " "
OutFile "${OUTFILE}"

; The Windows UI font at its standard size, instead of the 8pt dialog font.
SetFont "Segoe UI" 9

!define SCOPEDECK_RELEASE_URL "${HOMEPAGE}/releases/tag/v${VERSION}"
!define SCOPEDECK_ISSUES_URL "${HOMEPAGE}/issues"
; Colours mirror the app's tokens (src/styles/globals.css): the dark panel is
; the app's ground and ink, the link is the light theme's accent.
!define SCOPEDECK_TEXT "16171A"
!define SCOPEDECK_MUTED "5E6168"
!define SCOPEDECK_BG "FFFFFF"
!define SCOPEDECK_PANEL "0D0E10"
!define SCOPEDECK_PANEL_TEXT "E9EAEC"
!define SCOPEDECK_PANEL_MUTED "A1A3A9"
!define SCOPEDECK_ACCENT "3D72F2"
!define SCOPEDECK_LINK "2458D8"
!define /ifndef SS_PATHELLIPSIS 0x00008000
!define /ifndef ERROR_ALREADY_EXISTS 183
!define /ifndef ERROR_SUCCESS_REBOOT_REQUIRED 3010
!define /ifndef ERROR_INSTALL_USEREXIT 1602

; We don't actually use this value as default install path,
; it's just for nsis to append the product name folder in the directory selector
; https://nsis.sourceforge.io/Reference/InstallDir
!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME} Setup"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

# additional plugins
!addplugindir "${ADDITIONALPLUGINSPATH}"

; Uninstaller signing command
!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !error "Scopedeck's installer template supports the perMachine and currentUser install modes only."
!endif
!if "${LICENSE}" != ""
  !warning "bundle > licenseFile is set, but Scopedeck's installer has no license page."
!endif

; Installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; Installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; Enable header images for installer and uninstaller pages when either image is configured.
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!else if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!endif

; Installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_BITMAP "${HEADERIMAGE}"
!endif

; Uninstaller header image
!if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_UNBITMAP "${UNINSTALLERHEADERIMAGE}"
!endif

; Uninstaller icon
!if "${UNINSTALLERICON}" != ""
  !define MUI_UNICON "${UNINSTALLERICON}"
!endif

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Ask before closing Setup halfway through.
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Quit Scopedeck Setup? Scopedeck won't be installed."
!define MUI_UNABORTWARNING
!define MUI_UNABORTWARNING_TEXT "Quit without uninstalling Scopedeck?"

; -----------------------------------------------------------------------------
; Installer pages, in the order they appear
; -----------------------------------------------------------------------------

; 1. Install page: install, update, reinstall or older-version install
Page custom ScopedeckInstallPage ScopedeckInstallPageLeave

; 2. Start menu page: never shown, but its registry plumbing is what the
;    shortcut code and the uninstaller read
Var AppStartMenuFolder
!if "${STARTMENUFOLDER}" != ""
  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "${STARTMENUFOLDER}"
!endif
!define MUI_PAGE_CUSTOMFUNCTION_PRE Skip
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

; 3. Progress page. The Install section closes it on success, so it moves on
;    to the finish page by itself; "Show details" still has the full log if
;    something goes wrong.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW ScopedeckProgressShow
!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT "Setup didn't finish"
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT "Scopedeck may not work until Setup runs to the end. Run it again to finish."
!insertmacro MUI_PAGE_INSTFILES

; 4. Finish page
Page custom ScopedeckFinishPage ScopedeckFinishPageLeave

; NOTE: declares muiPageLoadFullWindow/muiPageUnloadFullWindow, which hide the
; header band for the install and finish pages. It must come while the
; installer's pages are being declared, before any uninstaller page.
!insertmacro MUI_PAGE_FUNCTION_FULLWINDOW

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
FunctionEnd

; -----------------------------------------------------------------------------
; Uninstaller pages, in the order they appear
; -----------------------------------------------------------------------------

; Read by the Uninstall section and the installer hooks: 1 when the user asked
; to remove their data as well.
Var DeleteAppDataCheckboxState

; 1. Confirm page
UninstPage custom un.ScopedeckConfirmPage un.ScopedeckConfirmPageLeave

; 2. Progress page
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ScopedeckProgressShow
!define /redef MUI_INSTFILESPAGE_ABORTHEADER_TEXT "Uninstall didn't finish"
!define /redef MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT "Some files may be left behind. Close Scopedeck and run the uninstaller again."
!insertmacro MUI_UNPAGE_INSTFILES

; NOTE: Modern UI has one full-window macro; it takes the uninstaller prefix
; from the page declared just before it, so this declares
; un.muiPageLoadFullWindow and un.muiPageUnloadFullWindow.
!insertmacro MUI_PAGE_FUNCTION_FULLWINDOW

; 3. Finish page
UninstPage custom un.ScopedeckFinishPage

;Languages
{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
LangString choowHowToInstall 0 ""
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}

Function .onInit
  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  Call ScopedeckCheckSystem

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}

  Call ScopedeckDetectExisting

  ; Abort downgrades if they are disabled, in the modes that skip the install
  ; page: silent, passive and update
  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    ${If} $ExistingState == "newer"
      ${If} ${Silent}
        System::Call 'kernel32::AttachConsole(i -1)i.r0'
        ${If} $0 <> 0
          System::Call 'kernel32::GetStdHandle(i -11)i.r0'
          System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
          FileWrite $0 "$(silentDowngrades)"
        ${EndIf}
      ${Else}
        MessageBox MB_ICONSTOP "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif
FunctionEnd

; Removes a per-machine MSI install before this per-user install lands, so the
; PC never ends up with two copies. Runs in every mode, including the updater's.
Section RemoveMsiInstall
  ${If} $WixMode <> 1
    Return
  ${EndIf}

  DetailPrint "Removing Scopedeck $ExistingVersion (MSI package)"
  ReadRegStr $R1 HKLM "$WixKey" "UninstallString"
  ; NOTE: the stored string is "MsiExec.exe /X{product-code}". /passive shows
  ; progress without the "are you sure" prompt, since the user already chose.
  ; Windows still asks for administrator approval for the per-machine package.
  ClearErrors
  ExecWait '$R1 /passive /norestart' $0
  ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|}

  ${If} $0 = ${ERROR_INSTALL_USEREXIT}
    DetailPrint "The MSI package was not removed: the request was cancelled"
    Abort "Scopedeck Setup needs to remove the MSI version first. Run Setup again and allow the request."
  ${ElseIf} $0 <> 0
  ${AndIf} $0 <> ${ERROR_SUCCESS_REBOOT_REQUIRED}
    DetailPrint "The MSI package was not removed (exit code $0)"
    Abort "Couldn't remove the MSI version of Scopedeck. Remove it from Settings > Apps, then run Setup again."
  ${EndIf}
  DetailPrint "Removed the MSI package"
  StrCpy $WixMode 0
SectionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
    ; Webview2 installation
    ;
    ; Skip if updating
    ${If} $UpdateMode <> 1
      !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        DetailPrint "$(webview2Downloading)"
        NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Pop $0
        ${If} $0 == "success"
          DetailPrint "$(webview2DownloadSuccess)"
        ${Else}
          DetailPrint "$(webview2DownloadError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
        Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        Goto install_webview2
      !endif

      Goto webview2_done

      install_webview2:
        DetailPrint "$(installingWebview2)"
        ; $6 holds the path to the webview2 installer
        ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
        ${If} $1 = 0
          DetailPrint "$(webview2InstallSuccess)"
        ${Else}
          DetailPrint "$(webview2InstallError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
      webview2_done:
    ${EndIf}
  ${Else}
    !if "${MINIMUMWEBVIEW2VERSION}" != ""
      ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
      ${If} $R0 = 1
        update_webview:
          DetailPrint "$(installingWebview2)"
          ${If} ${RunningX64}
            ReadRegStr $R1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate" "path"
          ${Else}
            ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 == ""
            ReadRegStr $R1 HKCU "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 != ""
            ; Chromium updater docs: https://source.chromium.org/chromium/chromium/src/+/main:docs/updater/user_manual.md
            ; Modified from "HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView\ModifyPath"
            ExecWait `"$R1" /install appguid=${WEBVIEW2APPGUID}&needsadmin=true` $1
            ${If} $1 = 0
              DetailPrint "$(webview2InstallSuccess)"
            ${Else}
              MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "$(webview2InstallError)" IDIGNORE ignore IDRETRY update_webview
              Quit
              ignore:
            ${EndIf}
          ${EndIf}
      ${EndIf}
    !endif
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Copy resources
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}

  ; Copy external binaries
  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  ; Create file associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
       !insertmacro APP_ASSOCIATE "{{ext}}" "{{or association.name ext}}" "{{association-description association.description ext}}" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0" "Open with ${PRODUCTNAME}" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
    {{/each}}
  {{/each}}

  ; Register deep links
  {{#each deep_link_protocols as |protocol| ~}}
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "URL Protocol" ""
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "" "URL:${BUNDLEID} protocol"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  {{/each}}

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  ; Remove old main binary if it doesn't match new main binary name
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}

  ; Save current MAINBINARYNAME for future updates
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  ; Lets scripts and package managers uninstall without the pages.
  WriteRegStr SHCTX "${UNINSTKEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}/releases"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}/issues"
  !endif

  ; Create start menu shortcut
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateOrUpdateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Desktop shortcut: the install page's checkbox decides; silent and passive
  ; installs always create one (as upstream does)
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
  ${OrIf} $DesktopShortcut = 1
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  ; Move on by itself: to the finish page interactively, or close in passive
  ; mode. A failed install never reaches this line, so its log stays on screen.
  SetAutoClose true
SectionEnd

Function .onInstSuccess
  ; Check for `/R` flag only in silent and passive installers because
  ; GUI installer has a toggle for the user to (re)start the app
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/R" $R0
    ${IfNot} ${Errors}
      ${GetOptions} $CMDLINE "/ARGS" $R0
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" "$R0"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.onInit
  !insertmacro SetContext

  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  StrCpy $DeleteAppDataCheckboxState 0
FunctionEnd

Section Uninstall

  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

  ; Delete external binaries
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  ; Delete app associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
      !insertmacro APP_UNASSOCIATE "{{ext}}" "{{or association.name ext}}"
    {{/each}}
  {{/each}}

  ; Delete deep links
  {{#each deep_link_protocols as |protocol| ~}}
    ReadRegStr $R7 SHCTX "Software\Classes\\{{protocol}}\shell\open\command" ""
    ${If} $R7 == "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
      DeleteRegKey SHCTX "Software\Classes\\{{protocol}}"
    ${EndIf}
  {{/each}}


  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  {{#each resources_ancestors}}
  RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Remove start menu shortcut
    !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Remove desktop shortcuts
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  ; Removes the Autostart entry for ${PRODUCTNAME} from the HKCU Run key if it exists.
  ; This ensures the program does not launch automatically after uninstallation if it exists.
  ; If it doesn't exist, it does nothing.
  ; We do this when not updating (to preserve the registry value on updates)
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}

  ; Delete app data if the checkbox is selected
  ; and if not updating
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    DetailPrint "Removing your Scopedeck data"
    ; Clear the install location $INSTDIR from registry
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUKEY}"

    ; Clear the install language from registry
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"

    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; Move on by itself: to the finish page interactively, or close in passive
  ; and update mode.
  SetAutoClose true
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function Skip
  Abort
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  StrCpy $R0 0

  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  ${If} $R0 = 1
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ${If} $UpdateMode = 1
  ${OrIf} $NoShortcutMode = 1
    Return
  ${EndIf}

  !if "${STARTMENUFOLDER}" != ""
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
FunctionEnd

Function CreateOrUpdateDesktopShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ${If} $UpdateMode = 1
  ${OrIf} $NoShortcutMode = 1
    Return
  ${EndIf}

  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
FunctionEnd

; -----------------------------------------------------------------------------
; System checks and existing-install detection
; -----------------------------------------------------------------------------

; Shows a message in interactive mode, then quits with an error code. Silent
; and passive runs (the updater, scripted installs) only get the exit code.
!macro SCOPEDECK_FAIL MESSAGE CODE
  ${IfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
    MessageBox MB_ICONSTOP|MB_OK "${MESSAGE}"
  ${EndIf}
  SetErrorLevel ${CODE}
  Quit
!macroend

Function ScopedeckCheckSystem
  ; NOTE: a second Setup would race the first over the same files and
  ; registry keys. The mutex lives as long as this process.
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\ScopedeckSetup") p .r0 ?e'
  Pop $1
  ${If} $1 = ${ERROR_ALREADY_EXISTS}
    !insertmacro SCOPEDECK_FAIL "Scopedeck Setup is already running." 1
  ${EndIf}

  ${IfNot} ${AtLeastWin10}
    !insertmacro SCOPEDECK_FAIL "Scopedeck needs Windows 10 or Windows 11." 1
  ${EndIf}

  !if "${ARCH}" == "x64"
    ${IfNot} ${RunningX64}
      !insertmacro SCOPEDECK_FAIL "Scopedeck needs a 64-bit version of Windows." 1
    ${EndIf}
    ; COMPAT: Windows 10 on ARM can't run x64 apps; Windows 11 on ARM can.
    ${If} ${IsNativeARM64}
    ${AndIfNot} ${AtLeastBuild} 22000
      !insertmacro SCOPEDECK_FAIL "Scopedeck runs on ARM PCs with Windows 11 or later." 1
    ${EndIf}
  !endif
FunctionEnd

; Sets $WixKey to the uninstall key of an MSI install of Scopedeck, or "".
;
; The MSI stores its uninstall entry under a product-code GUID, so every key
; is checked for a matching DisplayName and Publisher whose uninstaller is
; msiexec. Same matching as upstream's FindWixInstall.
Function ScopedeckFindMsiInstall
  StrCpy $WixKey ""
  StrCpy $0 0
  msi_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" msi_done
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 msi_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 msi_loop
    StrCpy $WixKey "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
  msi_done:
FunctionEnd

Function ScopedeckDetectExisting
  StrCpy $ExistingState "none"
  StrCpy $ExistingVersion ""
  StrCpy $WixMode 0
  StrCpy $DesktopShortcut 1

  ; An MSI install wins: it is a separate copy that must be removed first.
  Call ScopedeckFindMsiInstall
  ${If} $WixKey != ""
    StrCpy $WixMode 1
    ReadRegStr $ExistingVersion HKLM "$WixKey" "DisplayVersion"
  ${Else}
    ReadRegStr $0 SHCTX "${UNINSTKEY}" ""
    ReadRegStr $1 SHCTX "${UNINSTKEY}" "UninstallString"
    ${If} "$0$1" == ""
      Return
    ${EndIf}
    ReadRegStr $ExistingVersion SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}

  ${If} $ExistingVersion == ""
    ; An install without a version is treated as older, so it gets updated.
    StrCpy $ExistingState "older"
  ${Else}
    nsis_tauri_utils::SemverCompare "${VERSION}" $ExistingVersion
    Pop $0
    ${If} $0 = 0
      StrCpy $ExistingState "same"
    ${ElseIf} $0 = 1
      StrCpy $ExistingState "older"
    ${Else}
      StrCpy $ExistingState "newer"
    ${EndIf}
  ${EndIf}

  ; Keep the user's earlier choice: offer the desktop shortcut only if one exists.
  ${If} $WixMode = 0
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $DesktopShortcut
  ${EndIf}
FunctionEnd

; -----------------------------------------------------------------------------
; Page styling, shared by the installer and the uninstaller
; -----------------------------------------------------------------------------

Var ScopedeckStyleReady
Var ScopedeckFontTitle
Var ScopedeckFontStrong
Var ScopedeckFontSmall
Var ScopedeckFontBrand
Var ScopedeckIcon

!macro SCOPEDECK_COLORS HWND FG BG
  ${If} $HighContrast = 0
    SetCtlColors ${HWND} "${FG}" "${BG}"
  ${EndIf}
!macroend

; Creates a label with a font and colours; leaves its handle in $0.
!macro SCOPEDECK_LABEL X Y W H TEXT FONT FG BG
  ${NSD_CreateLabel} ${X} ${Y} ${W} ${H} "${TEXT}"
  Pop $0
  SendMessage $0 ${WM_SETFONT} ${FONT} 0
  !insertmacro SCOPEDECK_COLORS $0 "${FG}" "${BG}"
!macroend

; Creates a wrapping body-text label in the page's text colour.
!macro SCOPEDECK_BODY X Y W H TEXT
  ${NSD_CreateLabel} ${X} ${Y} ${W} ${H} "${TEXT}"
  Pop $0
  !insertmacro SCOPEDECK_COLORS $0 "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
!macroend

!macro SCOPEDECK_PANEL_TILE X Y W H
  ${NSD_CreateLabel} ${X} ${Y} ${W} ${H} ""
  Pop $1
  !insertmacro SCOPEDECK_COLORS $1 "" "${SCOPEDECK_PANEL}"
!macroend

; Sets the Next button's label and hides Back, which has nowhere to go.
!macro SCOPEDECK_BUTTONS NEXT_TEXT
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:${NEXT_TEXT}"
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
!macroend

; NSIS keeps installer and uninstaller code apart, and uninstaller functions
; must be named un.*, so the shared page helpers are stamped out twice.
!macro SCOPEDECK_STYLE_FUNCTIONS UN
  Function ${UN}ScopedeckInitStyle
    ${If} $ScopedeckStyleReady == 1
      Return
    ${EndIf}
    CreateFont $ScopedeckFontTitle "Segoe UI Semibold" 16 600
    CreateFont $ScopedeckFontStrong "Segoe UI Semibold" 9 600
    CreateFont $ScopedeckFontSmall "Segoe UI" 8 400
    CreateFont $ScopedeckFontBrand "Segoe UI Semibold" 13 600

    ; NOTE: in high contrast mode every colour comes from the system theme, so
    ; the pages skip their own colours entirely. HIGHCONTRASTW is 12 bytes in
    ; this 32-bit process; bit 0 of dwFlags is HCF_HIGHCONTRASTON.
    StrCpy $HighContrast 0
    System::Call '*(i 12, i 0, p 0) p .r0'
    System::Call 'user32::SystemParametersInfoW(i 0x42, i 12, p r0, i 0) i .r1'
    ${If} $1 <> 0
      System::Call '*$0(i, i .r2)'
      IntOp $HighContrast $2 & 1
    ${EndIf}
    System::Free $0
    StrCpy $ScopedeckStyleReady 1
  FunctionEnd

  ; The dark brand panel on the left of the full-window pages, built from
  ; native controls so it stays sharp at every display scale.
  Function ${UN}ScopedeckSidebar
    ; NOTE: sibling controls that overlap don't paint in a reliable order, so
    ; the panel is tiled around the icon and the accent rule instead of lying
    ; underneath them. Labels below sit on the last tile and come after it.
    !insertmacro SCOPEDECK_PANEL_TILE 0u 0u 109u 16u
    !insertmacro SCOPEDECK_PANEL_TILE 0u 16u 14u 24u
    !insertmacro SCOPEDECK_PANEL_TILE 38u 16u 71u 24u
    !insertmacro SCOPEDECK_PANEL_TILE 0u 40u 109u 100%

    ${NSD_CreateIcon} 14u 16u 24u 24u ""
    Pop $1
    ; SS_CENTERIMAGE keeps the control at 24u x 24u and fills around the icon
    ; with the panel colour instead of shrinking to the icon's size.
    ${NSD_AddStyle} $1 0x00000200
    System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .r2'
    ${If} $2 < 96
      StrCpy $2 96
    ${EndIf}
    IntOp $3 40 * $2
    IntOp $3 $3 / 96
    ; Icon 103 is the running executable's own icon resource: the app icon in
    ; both the installer and the uninstaller.
    System::Call 'kernel32::GetModuleHandleW(p 0) p .r4'
    System::Call 'user32::LoadImageW(p r4, p 103, i 1, i r3, i r3, i 0) p .r5'
    StrCpy $ScopedeckIcon $5
    SendMessage $1 ${STM_SETICON} $5 0
    !insertmacro SCOPEDECK_COLORS $1 "" "${SCOPEDECK_PANEL}"

    !insertmacro SCOPEDECK_LABEL 14u 50u 88u 16u "${PRODUCTNAME}" $ScopedeckFontBrand "${SCOPEDECK_PANEL_TEXT}" "${SCOPEDECK_PANEL}"
    ${NSD_CreateLabel} 14u 68u 24u 1u ""
    Pop $1
    !insertmacro SCOPEDECK_COLORS $1 "" "${SCOPEDECK_ACCENT}"
    !insertmacro SCOPEDECK_LABEL 14u 76u 88u 30u "A desktop client for the HackerOne Hacker API." $ScopedeckFontSmall "${SCOPEDECK_PANEL_MUTED}" "${SCOPEDECK_PANEL}"
    !insertmacro SCOPEDECK_LABEL 14u 166u 88u 20u "Open source · MIT$\r$\nNot affiliated with HackerOne" $ScopedeckFontSmall "${SCOPEDECK_PANEL_MUTED}" "${SCOPEDECK_PANEL}"
  FunctionEnd

  Function ${UN}ScopedeckFreeIcon
    ${If} $ScopedeckIcon != ""
    ${AndIf} $ScopedeckIcon <> 0
      System::Call 'user32::DestroyIcon(p $ScopedeckIcon)'
      StrCpy $ScopedeckIcon ""
    ${EndIf}
  FunctionEnd

  ; Creates the white content area of a full-window page; leaves it in $R0.
  Function ${UN}ScopedeckCreatePage
    nsDialogs::Create 1044
    Pop $R0
    ${If} $R0 == error
      Abort
    ${EndIf}
    nsDialogs::SetRTL $(^RTL)
    !insertmacro SCOPEDECK_COLORS $R0 "" "${SCOPEDECK_BG}"
  FunctionEnd
!macroend

!insertmacro SCOPEDECK_STYLE_FUNCTIONS ""
!insertmacro SCOPEDECK_STYLE_FUNCTIONS "un."

; -----------------------------------------------------------------------------
; Install page
; -----------------------------------------------------------------------------

Var ScopedeckPathLabel
Var ScopedeckShortcutBox

Function ScopedeckInstallPage
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
  Call ScopedeckInitStyle

  ${If} $WixMode = 1
    StrCpy $R1 "Update Scopedeck"
    StrCpy $R2 "Scopedeck $ExistingVersion was installed from the MSI package. Setup removes that copy, then installs ${VERSION} for your Windows account. Windows asks for permission to remove it. Your sign-in, drafts and settings are kept."
    StrCpy $R3 "Update"
  ${ElseIf} $ExistingState == "older"
    StrCpy $R1 "Update Scopedeck"
    ${If} $ExistingVersion == ""
      StrCpy $R2 "An earlier version of Scopedeck is installed. This updates it to ${VERSION} and keeps your sign-in, drafts and settings."
    ${Else}
      StrCpy $R2 "Scopedeck $ExistingVersion is installed. This updates it to ${VERSION} and keeps your sign-in, drafts and settings."
    ${EndIf}
    StrCpy $R3 "Update"
  ${ElseIf} $ExistingState == "same"
    StrCpy $R1 "Reinstall Scopedeck"
    StrCpy $R2 "Scopedeck ${VERSION} is already installed. Reinstalling restores its program files and keeps your sign-in, drafts and settings."
    StrCpy $R3 "Reinstall"
  ${ElseIf} $ExistingState == "newer"
    StrCpy $R1 "Install an older version"
    !if "${ALLOWDOWNGRADES}" == "false"
      StrCpy $R2 "Scopedeck $ExistingVersion is installed, which is newer than this installer. Download the latest version instead."
    !else
      StrCpy $R2 "Scopedeck $ExistingVersion is installed. This replaces it with ${VERSION}. Your sign-in, drafts and settings are kept; anything added after ${VERSION} is ignored."
    !endif
    StrCpy $R3 "Install ${VERSION}"
  ${Else}
    StrCpy $R1 "Install Scopedeck"
    StrCpy $R2 "Browse programs and scope offline, write reports in a real editor, and track your inbox and earnings. Scopedeck installs for your Windows account only, so it doesn't need administrator rights."
    StrCpy $R3 "Install"
  ${EndIf}

  Call ScopedeckCreatePage

  !insertmacro SCOPEDECK_LABEL 124u 14u 190u 20u $R1 $ScopedeckFontTitle "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  !insertmacro SCOPEDECK_LABEL 124u 36u 190u 10u "Version ${VERSION} for 64-bit Windows" $ScopedeckFontSmall "${SCOPEDECK_MUTED}" "${SCOPEDECK_BG}"
  !insertmacro SCOPEDECK_BODY 124u 54u 190u 42u $R2

  !insertmacro SCOPEDECK_LABEL 124u 102u 190u 10u "Install location" $ScopedeckFontStrong "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  ${NSD_CreateLabel} 124u 114u 190u 10u $INSTDIR
  Pop $ScopedeckPathLabel
  ${NSD_AddStyle} $ScopedeckPathLabel ${SS_PATHELLIPSIS}
  !insertmacro SCOPEDECK_COLORS $ScopedeckPathLabel "${SCOPEDECK_MUTED}" "${SCOPEDECK_BG}"
  ${If} $ExistingState == "none"
  ${OrIf} $WixMode = 1
    ${NSD_CreateLink} 124u 126u 90u 10u "Change location"
    Pop $0
    !insertmacro SCOPEDECK_COLORS $0 "${SCOPEDECK_LINK}" "${SCOPEDECK_BG}"
    ${NSD_OnClick} $0 ScopedeckChooseFolder
  ${Else}
    ; NOTE: moving an existing install would leave the old copy behind.
    !insertmacro SCOPEDECK_LABEL 124u 126u 190u 10u "Scopedeck stays where it is installed." $ScopedeckFontSmall "${SCOPEDECK_MUTED}" "${SCOPEDECK_BG}"
  ${EndIf}

  ${If} $NoShortcutMode <> 1
    ${NSD_CreateCheckbox} 124u 146u 190u 12u "Create a desktop shortcut"
    Pop $ScopedeckShortcutBox
    !insertmacro SCOPEDECK_COLORS $ScopedeckShortcutBox "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
    ${If} $DesktopShortcut = 1
      ${NSD_Check} $ScopedeckShortcutBox
    ${EndIf}
  ${EndIf}

  !insertmacro SCOPEDECK_LABEL 124u 170u 190u 18u "Free and open source under the MIT License. Your API token is stored in Windows Credential Manager, never in a file." $ScopedeckFontSmall "${SCOPEDECK_MUTED}" "${SCOPEDECK_BG}"

  Call ScopedeckSidebar
  Call muiPageLoadFullWindow
  !insertmacro SCOPEDECK_BUTTONS $R3
  !if "${ALLOWDOWNGRADES}" == "false"
    ${If} $ExistingState == "newer"
      GetDlgItem $0 $HWNDPARENT 1
      EnableWindow $0 0
    ${EndIf}
  !endif
  nsDialogs::Show
  Call muiPageUnloadFullWindow
  Call ScopedeckFreeIcon
FunctionEnd

Function ScopedeckInstallPageLeave
  ${If} $NoShortcutMode <> 1
    ${NSD_GetState} $ScopedeckShortcutBox $0
    ${If} $0 = ${BST_CHECKED}
      StrCpy $DesktopShortcut 1
    ${Else}
      StrCpy $DesktopShortcut 0
    ${EndIf}
  ${EndIf}

  ; Free space on the target drive, in MB, against the installed size plus a
  ; margin for the WebView2 bootstrapper and logs.
  StrCpy $1 $INSTDIR 3
  ClearErrors
  ${DriveSpace} $1 "/D=F /S=M" $2
  ${IfNot} ${Errors}
    IntOp $3 ${ESTIMATEDSIZE} / 1024
    IntOp $3 $3 + 64
    ${If} $2 < $3
      MessageBox MB_ICONEXCLAMATION|MB_OK "There isn't enough free space on $1. Scopedeck needs about $3 MB; $2 MB is free."
      Abort
    ${EndIf}
  ${EndIf}

  ; NOTE: this installer runs without administrator rights, so folders such as
  ; Program Files are read-only to it. Find out now rather than halfway through.
  ClearErrors
  CreateDirectory $INSTDIR
  FileOpen $0 "$INSTDIR\.scopedeck-setup-check" w
  ${If} ${Errors}
    MessageBox MB_ICONEXCLAMATION|MB_OK "Setup can't write to $INSTDIR. Choose a folder in your user profile, such as the one Setup suggests."
    Abort
  ${EndIf}
  FileClose $0
  Delete "$INSTDIR\.scopedeck-setup-check"
  ; Removes the folder again only if this check created it empty; the Install
  ; section recreates it.
  RMDir $INSTDIR
FunctionEnd

Function ScopedeckChooseFolder
  Pop $0
  nsDialogs::SelectFolderDialog "Choose where to install Scopedeck. A Scopedeck folder is created inside the folder you pick." $INSTDIR
  Pop $0
  ${If} $0 == error
  ${OrIf} $0 == ""
    Return
  ${EndIf}

  StrCpy $1 $0 1 -1
  ${If} $1 == "\"
    StrCpy $0 $0 -1
  ${EndIf}

  ; Local drives only: "X:" followed by an optional path.
  StrCpy $1 $0 1 1
  ${If} $1 != ":"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Choose a folder on a drive in this PC. Scopedeck can't be installed on a network location."
    Return
  ${EndIf}

  ${GetFileName} $0 $1
  ${If} $1 != "${PRODUCTNAME}"
    StrCpy $0 "$0\${PRODUCTNAME}"
  ${EndIf}

  StrLen $2 $WINDIR
  StrCpy $1 $0 $2
  StrCpy $3 $0 1 $2
  ${If} $1 == $WINDIR
  ${AndIf} $3 == "\"
    MessageBox MB_ICONEXCLAMATION|MB_OK "Scopedeck can't be installed inside the Windows folder. Choose another folder."
    Return
  ${EndIf}

  StrLen $1 $0
  ${If} $1 > 180
    MessageBox MB_ICONEXCLAMATION|MB_OK "That path is too long. Choose a folder with a shorter path."
    Return
  ${EndIf}

  StrCpy $INSTDIR $0
  ${NSD_SetText} $ScopedeckPathLabel $INSTDIR
FunctionEnd

; -----------------------------------------------------------------------------
; Install progress and finish pages
; -----------------------------------------------------------------------------

Function ScopedeckProgressShow
  ${If} $WixMode = 1
    !insertmacro MUI_HEADER_TEXT "Updating Scopedeck" "Removing the MSI version, then installing ${VERSION}."
  ${ElseIf} $ExistingState == "older"
    !insertmacro MUI_HEADER_TEXT "Updating Scopedeck" "Updating to version ${VERSION}. This takes a few seconds."
  ${ElseIf} $ExistingState == "same"
    !insertmacro MUI_HEADER_TEXT "Reinstalling Scopedeck" "This takes a few seconds."
  ${ElseIf} $ExistingState == "newer"
    !insertmacro MUI_HEADER_TEXT "Installing Scopedeck ${VERSION}" "This takes a few seconds."
  ${Else}
    !insertmacro MUI_HEADER_TEXT "Installing Scopedeck" "This takes a few seconds."
  ${EndIf}
FunctionEnd

Var ScopedeckLaunchBox

Function ScopedeckFinishPage
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
  Call ScopedeckInitStyle

  ${If} $ExistingState == "older"
    StrCpy $R1 "Scopedeck is updated"
    StrCpy $R2 "You're on version ${VERSION}. Your sign-in, drafts and settings were kept."
  ${ElseIf} $ExistingState == "same"
    StrCpy $R1 "Scopedeck is reinstalled"
    StrCpy $R2 "Scopedeck ${VERSION} is ready to use."
  ${ElseIf} $ExistingState == "newer"
    StrCpy $R1 "Scopedeck ${VERSION} is installed"
    StrCpy $R2 "Scopedeck checks for updates on its own, so it will offer the latest version again."
  ${Else}
    StrCpy $R1 "Scopedeck is installed"
    StrCpy $R2 "Find it in the Start menu. To connect, you need your HackerOne username and an API token from hackerone.com, under Settings > API token."
  ${EndIf}

  Call ScopedeckCreatePage

  !insertmacro SCOPEDECK_LABEL 124u 14u 190u 20u $R1 $ScopedeckFontTitle "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  !insertmacro SCOPEDECK_BODY 124u 40u 190u 30u $R2

  ${NSD_CreateCheckbox} 124u 80u 190u 12u "Launch Scopedeck"
  Pop $ScopedeckLaunchBox
  !insertmacro SCOPEDECK_COLORS $ScopedeckLaunchBox "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  ${NSD_Check} $ScopedeckLaunchBox

  ${NSD_CreateLink} 124u 172u 120u 10u "What's new in ${VERSION}"
  Pop $0
  !insertmacro SCOPEDECK_COLORS $0 "${SCOPEDECK_LINK}" "${SCOPEDECK_BG}"
  ${NSD_OnClick} $0 ScopedeckOpenReleaseNotes

  Call ScopedeckSidebar
  Call muiPageLoadFullWindow
  !insertmacro SCOPEDECK_BUTTONS "Finish"
  ; NOTE: as on Modern UI's own finish page, a disabled Cancel also disables
  ; the close button, so closing can't raise the "quit Setup" warning after a
  ; successful install.
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 0
  nsDialogs::Show
  Call muiPageUnloadFullWindow
  Call ScopedeckFreeIcon
FunctionEnd

Function ScopedeckFinishPageLeave
  ${NSD_GetState} $ScopedeckLaunchBox $0
  ${If} $0 = ${BST_CHECKED}
    Call RunMainBinary
  ${EndIf}
FunctionEnd

Function ScopedeckOpenReleaseNotes
  Pop $0
  ; SECURITY: if Setup was ever elevated, the browser must still open as the
  ; signed-in user, not as an administrator.
  nsis_tauri_utils::RunAsUser "$WINDIR\explorer.exe" "${SCOPEDECK_RELEASE_URL}"
FunctionEnd

; -----------------------------------------------------------------------------
; Uninstaller pages
; -----------------------------------------------------------------------------

Var ScopedeckRemoveDataBox

Function un.ScopedeckConfirmPage
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    Abort
  ${EndIf}
  Call un.ScopedeckInitStyle

  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${If} $R1 == ""
    StrCpy $R1 "Installed in"
  ${Else}
    StrCpy $R1 "Version $R1, installed in"
  ${EndIf}

  Call un.ScopedeckCreatePage

  !insertmacro SCOPEDECK_LABEL 124u 14u 190u 20u "Uninstall Scopedeck" $ScopedeckFontTitle "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  !insertmacro SCOPEDECK_LABEL 124u 36u 190u 10u $R1 $ScopedeckFontSmall "${SCOPEDECK_MUTED}" "${SCOPEDECK_BG}"
  ${NSD_CreateLabel} 124u 46u 190u 10u $INSTDIR
  Pop $0
  ${NSD_AddStyle} $0 ${SS_PATHELLIPSIS}
  SendMessage $0 ${WM_SETFONT} $ScopedeckFontSmall 0
  !insertmacro SCOPEDECK_COLORS $0 "${SCOPEDECK_MUTED}" "${SCOPEDECK_BG}"

  !insertmacro SCOPEDECK_BODY 124u 64u 190u 22u "This removes Scopedeck, its Start menu and desktop shortcuts, and its entry in Installed apps."

  !insertmacro SCOPEDECK_LABEL 124u 96u 190u 10u "Your data" $ScopedeckFontStrong "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  ${NSD_CreateCheckbox} 124u 110u 190u 12u "Also remove my data from this PC"
  Pop $ScopedeckRemoveDataBox
  !insertmacro SCOPEDECK_COLORS $ScopedeckRemoveDataBox "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  ${If} $DeleteAppDataCheckboxState = 1
    ${NSD_Check} $ScopedeckRemoveDataBox
  ${EndIf}
  !insertmacro SCOPEDECK_LABEL 136u 124u 178u 44u "Drafts, templates, saved searches, program notes and cached HackerOne data, plus your API token and AI provider key in Windows Credential Manager. Leave this unticked to pick up where you left off after a reinstall." $ScopedeckFontSmall "${SCOPEDECK_MUTED}" "${SCOPEDECK_BG}"

  Call un.ScopedeckSidebar
  Call un.muiPageLoadFullWindow
  !insertmacro SCOPEDECK_BUTTONS "Uninstall"
  nsDialogs::Show
  Call un.muiPageUnloadFullWindow
  Call un.ScopedeckFreeIcon
FunctionEnd

Function un.ScopedeckConfirmPageLeave
  ${NSD_GetState} $ScopedeckRemoveDataBox $0
  ${If} $0 = ${BST_CHECKED}
    StrCpy $DeleteAppDataCheckboxState 1
  ${Else}
    StrCpy $DeleteAppDataCheckboxState 0
  ${EndIf}
FunctionEnd

Function un.ScopedeckProgressShow
  ${If} $DeleteAppDataCheckboxState = 1
    !insertmacro MUI_HEADER_TEXT "Uninstalling Scopedeck" "Removing the app and your data from this PC."
  ${Else}
    !insertmacro MUI_HEADER_TEXT "Uninstalling Scopedeck" "Removing the app. Your data stays on this PC."
  ${EndIf}
FunctionEnd

Function un.ScopedeckFinishPage
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    Abort
  ${EndIf}
  Call un.ScopedeckInitStyle

  ${If} $DeleteAppDataCheckboxState = 1
    StrCpy $R2 "Your drafts, settings and cached data were removed, and the API token and AI key were deleted from Windows Credential Manager.$\r$\n$\r$\nThe token itself stays valid on HackerOne until you regenerate it there."
  ${Else}
    StrCpy $R2 "Your sign-in, drafts and settings were kept, so a reinstall picks up where you left off. To remove them later, reinstall and uninstall again with the data option ticked."
  ${EndIf}

  Call un.ScopedeckCreatePage

  !insertmacro SCOPEDECK_LABEL 124u 14u 190u 20u "Scopedeck is uninstalled" $ScopedeckFontTitle "${SCOPEDECK_TEXT}" "${SCOPEDECK_BG}"
  !insertmacro SCOPEDECK_BODY 124u 40u 190u 60u $R2

  ${NSD_CreateLink} 124u 172u 150u 10u "Report a problem or share feedback"
  Pop $0
  !insertmacro SCOPEDECK_COLORS $0 "${SCOPEDECK_LINK}" "${SCOPEDECK_BG}"
  ${NSD_OnClick} $0 un.ScopedeckOpenIssues

  Call un.ScopedeckSidebar
  Call un.muiPageLoadFullWindow
  !insertmacro SCOPEDECK_BUTTONS "Close"
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 0
  nsDialogs::Show
  Call un.muiPageUnloadFullWindow
  Call un.ScopedeckFreeIcon
FunctionEnd

Function un.ScopedeckOpenIssues
  Pop $0
  nsis_tauri_utils::RunAsUser "$WINDIR\explorer.exe" "${SCOPEDECK_ISSUES_URL}"
FunctionEnd
