Var prtsSplashProcess
Var prtsSplashUnpacked
Var prtsSplashDone
Var prtsCacheRoot
Var prtsDataRoot
Var prtsPointerIni
Var prtsPickReason
Var prtsStageDir
Var prtsCleanupInstDir
Var prtsSawWindow
Var prtsRetriedSafe

!ifndef PRTS_PRODUCT_KEY
  !define PRTS_PRODUCT_KEY "stronghold"
!endif
!ifndef PRTS_POINTER_INI_NAME
  !define PRTS_POINTER_INI_NAME "storage-root.ini"
!endif

; The portable NSIS stub is 32-bit. $R1 is the quoted command line, $R5 and $R7 are the child handle and PID.
Function PrtsLaunchProcess
  System::Call '*(i 68,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,i 0,&i2 0,&i2 0,i 0,i 0,i 0,i 0)p.R2'
  System::Call '*(i 0,i 0,i 0,i 0)p.R3'
  System::Call 'kernel32::CreateProcessW(p 0,w R1,p 0,p 0,i 0,i 0,p 0,p 0,p R2,p R3)i.R4'
  System::Free $R2
  StrCpy $R5 0
  StrCmp $R4 0 prts_created
  System::Call '*$R3(p .R5,p .R6,i .R7,i)'
  System::Call 'kernel32::CloseHandle(p R6)'
prts_created:
  System::Free $R3
FunctionEnd

Function PrtsShowSplash
  File /oname=$PLUGINSDIR\prts-splash.exe "prts-splash.exe"
  System::Call 'kernel32::GetCurrentProcessId()i.r0'
  System::Call 'kernel32::CreateEventW(p 0,i 1,i 0,w "Local\PRTS.Stronghold.Splash.$0.Unpacked")p.r1'
  StrCpy $prtsSplashUnpacked $1
  System::Call 'kernel32::CreateEventW(p 0,i 1,i 0,w "Local\PRTS.Stronghold.Splash.$0.Done")p.r1'
  StrCpy $prtsSplashDone $1
  ${If} $prtsSplashUnpacked != 0
  ${AndIf} $prtsSplashDone != 0
    StrCpy $R1 '"$PLUGINSDIR\prts-splash.exe" $0'
    Call PrtsLaunchProcess
    StrCpy $prtsSplashProcess $R5
  ${EndIf}
FunctionEnd

Function PrtsCloseSplash
  ${If} $prtsSplashDone != 0
    System::Call 'kernel32::SetEvent(p $prtsSplashDone)'
    System::Call 'kernel32::CloseHandle(p $prtsSplashDone)'
    StrCpy $prtsSplashDone 0
  ${EndIf}
  ${If} $prtsSplashUnpacked != 0
    System::Call 'kernel32::CloseHandle(p $prtsSplashUnpacked)'
    StrCpy $prtsSplashUnpacked 0
  ${EndIf}
  ${If} $prtsSplashProcess != 0
    Push $0
    System::Call 'kernel32::WaitForSingleObject(p $prtsSplashProcess,i 1000)i.r0'
    ${If} $0 == 258
      ; Release the temporary executable if its splash UI stopped responding.
      System::Call 'kernel32::TerminateProcess(p $prtsSplashProcess,i 1)'
      System::Call 'kernel32::WaitForSingleObject(p $prtsSplashProcess,i 1000)'
    ${EndIf}
    Pop $0
    System::Call 'kernel32::CloseHandle(p $prtsSplashProcess)'
    StrCpy $prtsSplashProcess 0
  ${EndIf}
FunctionEnd

; Input: $0 = directory path, $R8 = PID. Output: $1 = "1" if writable, "0" otherwise.
Function PrtsTestWritableDir
  CreateDirectory "$0"
  ClearErrors
  FileOpen $2 "$0\.probe-$R8" w
  IfErrors prts_dir_unwritable
  FileClose $2
  Delete "$0\.probe-$R8"
  StrCpy $1 "1"
  Return
prts_dir_unwritable:
  StrCpy $1 "0"
FunctionEnd

; Input: $0 = existing directory path, $2 = required MB. Output: $3 = "1" (ok) / "0" (low), $4 = free MB.
Function PrtsCheckFreeSpaceMb
  StrCpy $3 "1"
  StrCpy $4 "99999"
  System::Call 'kernel32::GetDiskFreeSpaceExW(w r0, *l .r1, p 0, p 0)i.r5'
  ${If} $5 != 0
    System::Int64Op $1 / 1048576
    Pop $4
    ${If} $4 < $2
      StrCpy $3 "0"
    ${EndIf}
  ${EndIf}
FunctionEnd

; Clean previous cached build directories under $prtsCacheRoot (keeps active $R9 and in-flight tmp-* folders).
Function PrtsPruneOldCache
  ${If} $prtsCacheRoot == ""
    Return
  ${EndIf}
  FindFirst $0 $1 "$prtsCacheRoot\*"
prts_prune_loop:
  StrCmp $1 "" prts_prune_done
  StrCmp $1 "." prts_prune_next
  StrCmp $1 ".." prts_prune_next
  StrCmp $1 $R9 prts_prune_next
  StrCpy $2 $1 4
  StrCmp $2 "tmp-" prts_prune_next
  RMDir /r "$prtsCacheRoot\$1"
prts_prune_next:
  FindNext $0 $1
  Goto prts_prune_loop
prts_prune_done:
  FindClose $0
FunctionEnd

; Direct 1-pass unpack into a versioned local cache (zero CopyFiles / SHFileOperation double-copy).
; Subsequent launches reuse the verified cache instantly without re-extracting ~500 MB.
!macro PrtsPrepareApp
  System::Call 'kernel32::GetCurrentProcessId()i.R8'
  !ifdef APP_64_HASH
    StrCpy $R9 "${APP_64_HASH}" 16
  !else
    !ifdef UNPACK_DIR_NAME
      StrCpy $R9 "${UNPACK_DIR_NAME}" 16
    !else
      StrCpy $R9 "default"
    !endif
  !endif

  StrCpy $prtsCacheRoot ""
  StrCpy $prtsDataRoot ""
  StrCpy $prtsPickReason ""
  StrCpy $prtsCleanupInstDir "0"
  StrCpy $prtsPointerIni "$LOCALAPPDATA\PRTS-Stronghold\${PRTS_POINTER_INI_NAME}"

  ; 1. Resolve existing storage root pointer (preserves user path across L1/L2 updates without re-prompting)
  ReadINIStr $prtsDataRoot "$EXEDIR\prts-portable.ini" "storage" "dataRoot"
  ${If} $prtsDataRoot == ""
  ${AndIf} $LOCALAPPDATA != ""
    ReadINIStr $prtsDataRoot "$prtsPointerIni" "storage" "dataRoot"
  ${EndIf}

  ${If} $prtsDataRoot != ""
    StrCpy $0 "$prtsDataRoot"
    Call PrtsTestWritableDir
    ${If} $1 != "1"
      StrCpy $prtsDataRoot ""
      StrCpy $prtsPickReason "missing"
    ${EndIf}
  ${EndIf}

  ; 2. First launch with no valid pointer:
  ;    - Non-C: writable EXE folder -> silently auto-place in <EXEDIR>\PRTS-Data (zero C: usage!)
  ;    - EXE on C: drive (or read-only / previous drive missing) -> show native path picker before unpacking
  ${If} $prtsDataRoot == ""
    StrCpy $2 "$EXEDIR" 2
    ${If} $prtsPickReason == ""
    ${AndIf} $2 != "C:"
      StrCpy $0 "$EXEDIR\PRTS-Data"
      Call PrtsTestWritableDir
      ${If} $1 == "1"
        StrCpy $prtsDataRoot "$0"
        WriteINIStr "$EXEDIR\prts-portable.ini" "storage" "dataRoot" "$prtsDataRoot"
        ${If} $LOCALAPPDATA != ""
          CreateDirectory "$LOCALAPPDATA\PRTS-Stronghold"
          WriteINIStr "$prtsPointerIni" "storage" "dataRoot" "$prtsDataRoot"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $prtsDataRoot == ""
    Call PrtsCloseSplash
    File /oname=$PLUGINSDIR\prts-splash.exe "prts-splash.exe"
    Delete "$PLUGINSDIR\picked-root.txt"
    ExecWait '"$PLUGINSDIR\prts-splash.exe" --pick-storage "$PLUGINSDIR\picked-root.txt" "${PRODUCT_FILENAME}" "$EXEDIR" "$prtsPickReason"' $0
    ${If} $0 == 2
      SetErrorLevel 0
      Quit
    ${EndIf}
    ClearErrors
    FileOpen $2 "$PLUGINSDIR\picked-root.txt" r
    ${IfNot} ${Errors}
      FileRead $2 $prtsDataRoot
      FileClose $2
      ; Strip trailing CR/LF if any
      StrCpy $0 $prtsDataRoot 1 -1
      ${If} $0 == "$\n"
        StrCpy $prtsDataRoot $prtsDataRoot -1
      ${EndIf}
      StrCpy $0 $prtsDataRoot 1 -1
      ${If} $0 == "$\r"
        StrCpy $prtsDataRoot $prtsDataRoot -1
      ${EndIf}
    ${EndIf}
    ${If} $prtsDataRoot != ""
      ${If} $LOCALAPPDATA != ""
        CreateDirectory "$LOCALAPPDATA\PRTS-Stronghold"
        WriteINIStr "$prtsPointerIni" "storage" "dataRoot" "$prtsDataRoot"
      ${EndIf}
    ${EndIf}
    IfSilent prts_picker_resumed
      Call PrtsShowSplash
    prts_picker_resumed:
  ${EndIf}

  ; 3. Export PRTS_DATA_ROOT to Electron and unpack runtime cache directly into <DataRoot>\<product>\runtime-cache
  ${If} $prtsDataRoot != ""
    StrCpy $0 "$prtsDataRoot"
    System::Call 'kernel32::SetEnvironmentVariableW(w "PRTS_DATA_ROOT", w r0)'
    CreateDirectory "$prtsDataRoot\${PRTS_PRODUCT_KEY}"
    StrCpy $0 "$prtsDataRoot\${PRTS_PRODUCT_KEY}\runtime-cache"
    Call PrtsTestWritableDir
    ${If} $1 == "1"
      StrCpy $prtsCacheRoot "$0"
    ${EndIf}
  ${EndIf}

  ; Legacy fallback only if DataRoot could not be resolved/written
  ${If} $prtsCacheRoot == ""
  ${AndIf} $LOCALAPPDATA != ""
    CreateDirectory "$LOCALAPPDATA\PRTS-Cache"
    StrCpy $0 "$LOCALAPPDATA\PRTS-Cache\${PRODUCT_FILENAME}"
    Call PrtsTestWritableDir
    ${If} $1 == "1"
      StrCpy $prtsCacheRoot "$0"
    ${EndIf}
  ${EndIf}
  ${If} $prtsCacheRoot == ""
    CreateDirectory "$TEMP\PRTS-Cache"
    StrCpy $0 "$TEMP\PRTS-Cache\${PRODUCT_FILENAME}"
    Call PrtsTestWritableDir
    ${If} $1 == "1"
      StrCpy $prtsCacheRoot "$0"
    ${EndIf}
  ${EndIf}

  ${If} $prtsCacheRoot != ""
    StrCpy $INSTDIR "$prtsCacheRoot\$R9"
    StrCpy $prtsCleanupInstDir "0"
  ${Else}
    StrCpy $INSTDIR "$PLUGINSDIR\app"
    StrCpy $prtsCleanupInstDir "1"
  ${EndIf}

  ; Fast path: reuse verified versioned cache (0 ms unpack, avoids antivirus re-scan & mid-game I/O stalls).
  IfFileExists "$INSTDIR\.prts-ready" 0 prts_need_unpack
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 prts_need_unpack
  IfFileExists "$INSTDIR\ffmpeg.dll" 0 prts_need_unpack
  IfFileExists "$INSTDIR\resources\app.asar" prts_app_ready prts_need_unpack

prts_need_unpack:
  Call PrtsPruneOldCache

  ; Check free disk space before writing payload so low-space C: drives show an actionable message instead of stalling.
  !ifdef APP_64_UNPACKED_SIZE
    IntOp $2 ${APP_64_UNPACKED_SIZE} / 1024
    IntOp $2 $2 + 280
  !else
    StrCpy $2 800
  !endif
  ${If} $prtsCacheRoot != ""
    StrCpy $0 "$prtsCacheRoot"
  ${Else}
    StrCpy $0 "$PLUGINSDIR"
  ${EndIf}
  Call PrtsCheckFreeSpaceMb
  ${If} $3 == "0"
    Call PrtsCloseSplash
    SetSilent normal
    MessageBox MB_OK|MB_ICONSTOP "磁盘可用空间不足，无法完成首次解包。$\r$\n$\r$\n目标位置需要约 $2 MB 空间，当前仅剩 $4 MB。请清理 C 盘空间后重试。"
    SetErrorLevel 1
    Quit
  ${EndIf}

  ; Extract embedded 7z directly into a unique per-PID staging dir in 1 pass (no 7z-out + CopyFiles double-copy).
  !ifdef APP_64
    !ifdef COMPRESS
      SetCompress off
    !endif
    ClearErrors
    File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
    !ifdef COMPRESS
      SetCompress "${COMPRESS}"
    !endif
    IfFileExists "$PLUGINSDIR\app-64.${COMPRESSION_METHOD}" prts_archive_ready
    Call PrtsCloseSplash
    SetSilent normal
    MessageBox MB_OK|MB_ICONSTOP "无法释放应用安装包，可能是临时目录空间不足或被安全软件拦截。$\r$\n$\r$\n请检查 C 盘空间并将本程序加入 Windows Defender / 360 / 火绒信任区后重试。"
    SetErrorLevel 1
    Quit
prts_archive_ready:
    ${If} $prtsCacheRoot != ""
      StrCpy $prtsStageDir "$prtsCacheRoot\tmp-$R8"
    ${Else}
      StrCpy $prtsStageDir "$INSTDIR"
    ${EndIf}
    RMDir /r "$prtsStageDir"
    CreateDirectory "$prtsStageDir"
    SetOutPath "$prtsStageDir"
    ClearErrors
    Nsis7z::Extract "$PLUGINSDIR\app-64.${COMPRESSION_METHOD}"
    Delete "$PLUGINSDIR\app-64.${COMPRESSION_METHOD}"
  !else
    StrCpy $prtsStageDir "$INSTDIR"
    RMDir /r "$prtsStageDir"
    CreateDirectory "$prtsStageDir"
    SetOutPath "$prtsStageDir"
    !insertmacro extractEmbeddedAppPackage
  !endif

  ; Verify extracted main binary and ASAR before switching to launch.
  IfFileExists "$prtsStageDir\${APP_EXECUTABLE_FILENAME}" 0 prts_unpack_failed
  IfFileExists "$prtsStageDir\resources\app.asar" prts_unpack_verified prts_unpack_failed

prts_unpack_failed:
  SetOutPath $EXEDIR
  RMDir /r "$prtsStageDir"
  Call PrtsCloseSplash
  SetSilent normal
  MessageBox MB_OK|MB_ICONSTOP "应用首次解包失败，主程序文件缺失或被拦截。$\r$\n$\r$\n常见原因：$\r$\n1. Windows Defender / 360 / 火绒拦截隔离了主程序（请加入信任区）$\r$\n2. C 盘可用空间不足（首次解包需约 $2 MB）$\r$\n3. 安装包下载不完整，请重新下载后重试。"
  SetErrorLevel 1
  Quit

prts_unpack_verified:
  FileOpen $0 "$prtsStageDir\.prts-ready" w
  FileWrite $0 "ok"
  FileClose $0

  ${If} $prtsStageDir != $INSTDIR
    ; Release CWD handle on staging dir before atomic NTFS directory rename.
    SetOutPath $EXEDIR
    Rename "$prtsStageDir" "$INSTDIR"
    IfFileExists "$INSTDIR\.prts-ready" 0 prts_rename_fallback
    RMDir /r "$prtsStageDir"
    Goto prts_app_ready
prts_rename_fallback:
    ; If another process locked $INSTDIR mid-race, run cleanly from our unique staging folder and remove it on exit.
    StrCpy $INSTDIR "$prtsStageDir"
    StrCpy $prtsCleanupInstDir "1"
  ${EndIf}

prts_app_ready:
  SetOutPath "$INSTDIR"
!macroend

Function PrtsRunApp
  ${If} $prtsSplashUnpacked != 0
    System::Call 'kernel32::SetEvent(p $prtsSplashUnpacked)'
  ${EndIf}
  StrCpy $prtsRetriedSafe "0"
  StrCpy $R1 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $R0'

prts_launch_attempt:
  StrCpy $prtsSawWindow "0"
  System::Call 'kernel32::GetTickCount()i.r8'
  Call PrtsLaunchProcess
  ${If} $R5 == 0
    ${If} $prtsCacheRoot != ""
      Delete "$INSTDIR\.prts-ready"
    ${EndIf}
    Call PrtsCloseSplash
    SetSilent normal
    MessageBox MB_OK|MB_ICONSTOP "无法启动主程序，可能被安全软件（Windows Defender / 360 / 火绒）拦截。$\r$\n$\r$\n已自动标记下次启动重新释放缓存；请将本程序加入信任区后重试。"
    SetErrorLevel 1
    Return
  ${EndIf}
  StrCpy $3 0

prts_find_window:
  StrCpy $4 0
prts_next_window:
  System::Call 'user32::FindWindowExW(p 0,p r4,w "Chrome_WidgetWin_1",p 0)p.r4'
  StrCmp $4 0 prts_wait_frame
  System::Call 'user32::GetWindowThreadProcessId(p r4,*i .r5)i'
  StrCmp $5 $R7 0 prts_next_window
  System::Call 'user32::IsWindowVisible(p r4)i.r6'
  StrCmp $6 0 prts_next_window
  StrCpy $prtsSawWindow "1"
  Goto prts_hide_startup

prts_wait_frame:
  System::Call 'kernel32::WaitForSingleObject(p R5,i 50)i.r5'
  StrCmp $5 258 0 prts_process_exited
  IntOp $3 $3 + 1
  ; Bound the wait for visibility even if Electron remains running without its window.
  IntCmp $3 1800 prts_hide_startup prts_find_window prts_hide_startup

prts_hide_startup:
  Call PrtsCloseSplash
  System::Call 'kernel32::WaitForSingleObject(p R5,i -1)i'

prts_process_exited:
  System::Call 'kernel32::GetTickCount()i.r9'
  System::Call 'kernel32::GetExitCodeProcess(p R5,*i .r0)i.r1'
  System::Call 'kernel32::CloseHandle(p R5)'
  StrCmp $1 0 0 +2
    StrCpy $0 1

  ; Auto-retry once in safe GPU/no-sandbox mode if Electron crashed before showing any window.
  ${If} $0 != 0
  ${AndIf} $prtsSawWindow == "0"
  ${AndIf} $prtsRetriedSafe == "0"
    StrCpy $prtsRetriedSafe "1"
    StrCpy $R1 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --prts-safe-gpu --disable-gpu --disable-gpu-sandbox --no-sandbox $R0'
    Goto prts_launch_attempt
  ${EndIf}

  Call PrtsCloseSplash

  ${If} $0 != 0
  ${AndIf} $prtsSawWindow == "0"
    ${If} $prtsCacheRoot != ""
      Delete "$INSTDIR\.prts-ready"
    ${EndIf}
    SetSilent normal
    MessageBox MB_OK|MB_ICONSTOP "应用启动失败，主窗口未能打开（退出码：$0）。$\r$\n$\r$\n常见原因：$\r$\n1. 安全软件拦截主程序$\r$\n2. 远程桌面（如 ToDesk）或显卡驱动钩子与高权限渲染冲突$\r$\n3. 系统 UAC 策略限制$\r$\n$\r$\n已自动尝试兼容渲染模式并重置缓存，请查看 %APPDATA% 下 startup.log 并反馈给开发者。"
  ${ElseIf} $0 != 0
  ${AndIf} $prtsCacheRoot != ""
    ; Self-healing cache guard: if Electron crashed almost immediately (< 3.5s) with non-zero exit code,
    ; invalidate .prts-ready so the next launch automatically performs a clean re-extraction.
    IntOp $9 $9 - $8
    ${If} $9 >= 0
    ${AndIf} $9 < 3500
      Delete "$INSTDIR\.prts-ready"
    ${EndIf}
  ${EndIf}
  SetErrorLevel $0
FunctionEnd

Function .onInstFailed
  Call PrtsCloseSplash
FunctionEnd
