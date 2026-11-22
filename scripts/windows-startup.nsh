Var prtsSplashProcess
Var prtsSplashUnpacked
Var prtsSplashDone

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
    System::Call 'kernel32::WaitForSingleObject(p $prtsSplashProcess,i 1000)i.r0'
    ${If} $0 == 258
      ; Release the temporary executable if its splash UI stopped responding.
      System::Call 'kernel32::TerminateProcess(p $prtsSplashProcess,i 1)'
      System::Call 'kernel32::WaitForSingleObject(p $prtsSplashProcess,i 1000)'
    ${EndIf}
    System::Call 'kernel32::CloseHandle(p $prtsSplashProcess)'
    StrCpy $prtsSplashProcess 0
  ${EndIf}
FunctionEnd

Function PrtsRunApp
  ${If} $prtsSplashUnpacked != 0
    System::Call 'kernel32::SetEvent(p $prtsSplashUnpacked)'
  ${EndIf}
  StrCpy $R1 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $R0'
  Call PrtsLaunchProcess
  ${If} $R5 == 0
    Call PrtsCloseSplash
    SetErrorLevel 1
    Return
  ${EndIf}
  StrCmp $prtsSplashProcess 0 prts_hide_startup
  StrCpy $3 0

prts_find_window:
  StrCpy $4 0
prts_next_window:
  System::Call 'user32::FindWindowExW(p 0,p r4,w "Chrome_WidgetWin_1",p 0)p.r4'
  StrCmp $4 0 prts_wait_frame
  System::Call 'user32::GetWindowThreadProcessId(p r4,*i .r5)i'
  StrCmp $5 $R7 0 prts_next_window
  System::Call 'user32::IsWindowVisible(p r4)i.r6'
  StrCmp $6 0 prts_next_window prts_hide_startup

prts_wait_frame:
  System::Call 'kernel32::WaitForSingleObject(p R5,i 50)i.r5'
  StrCmp $5 258 0 prts_hide_startup
  IntOp $3 $3 + 1
  ; Bound the wait for visibility even if Electron remains running without its window.
  IntCmp $3 1800 prts_hide_startup prts_find_window prts_hide_startup

prts_hide_startup:
  Call PrtsCloseSplash
  System::Call 'kernel32::WaitForSingleObject(p R5,i -1)i'
  System::Call 'kernel32::GetExitCodeProcess(p R5,*i .r0)i.r1'
  System::Call 'kernel32::CloseHandle(p R5)'
  StrCmp $1 0 0 +2
    StrCpy $0 1
  SetErrorLevel $0
FunctionEnd

Function .onInstFailed
  Call PrtsCloseSplash
FunctionEnd
