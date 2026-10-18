; Manuel Diaz
; 2026
; ---------------------------------
; Achievement Watcher
; ---------------------------------

[Setup]
#define AppUserModelID "io.github.xan105.achievement.watcher"
#define AppName "Achievement Watcher"
#define OurVersion "2.0"
#define Author "Manuel Diaz"
#define Website "https://github.com/Godwing2509/Archivement-Watcher"
#define DonationURL "https://www.paypal.me/xan105"
#define VersionURL "https://github.com/xan105/Achievement-Watcher/raw/master/setup/version.ini"
#define Copyright "© 2026"

; xp, vista, win7, win8, win8.1, win10
#define MinWin "win7"

#define AppMain "{app}\AchievementWatcher.exe"
#define AppWorkingDir "{app}"
#define AppIcon "{app}\icon.ico"

#define OutputFileName "Achievement.Watcher.Setup"

AppId={{2D4560A4-D5A2-4087-9717-E188CE329E97}}
AppName={#AppName}
AppVerName={#AppName}
AppVersion={#OurVersion}
VersionInfoVersion={#OurVersion}
VersionInfoCopyright={#Copyright} {#Author}
AppPublisher={#Author}
AppPublisherURL={#Website}
VersionInfoDescription={#AppName}
DefaultDirName={pf}\{#AppName}
  DirExistsWarning=no
DefaultGroupName={#AppName}
Compression=lzma2/ultra64
;Compression=none
DiskSpanning=no
  SlicesPerDisk=3
  DiskSliceSize=1566000000
OutputDir=_dist_\
  OutputBaseFilename={#OutputFileName}
SolidCompression=yes
LZMAUseSeparateProcess=yes
AllowRootDirectory=yes
DisableWelcomePage=no
DisableReadyPage=yes
DisableDirPage=no
DisableFinishedPage=no
DisableProgramGroupPage=yes
SetupIconFile=resources\icon.ico
WizardSmallImageFile=resources\wizard.bmp
WizardImageFile=resources\left.bmp
Uninstallable=GetOption('CreateUninstaller')
UninstallFilesDir={app}\__unins__
UninstallDisplayIcon={#AppMain}
RestartIfNeededByRun=no
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
CloseApplications=force

[Languages]
; Español como idioma principal de instalación (Español latino / Spain según sistema)
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1={#AppName} %nAsistente de instalación
FinishedHeadingLabel={#AppName} %nAsistente de instalación

[CustomMessages]
es.InstallingLabel=Instalando %1, espere ...
es.UninstallProgram=Desinstalar %1
es.ErrorMinWin=%1 requiere una versión más reciente de Windows
es.Options=Opciones
es.CreateDesktopIcon=Crear icono en el escritorio
es.CreateStartMenu=Crear entrada en el menú Inicio
es.CreateUninstaller=Crear desinstalador
es.StartWithWindows=Iniciar con Windows (ejecuta la app al iniciar sesión)
es.ButtonDonate=Donar
es.Finishing=Finalizando ...
es.Redist=VCRuntime 2015-2019 ...
es.DirectX=DirectX Runtime ...
es.ErrorShouldUpgrade=Debe actualizar su sistema operativo.
es.UpdateNotice=Hay una versión más reciente de este instalador en
en.InstallingLabel=Installing %1, please wait ...
en.UninstallProgram=Uninstall %1
en.ErrorMinWin=%1 requires a newer version of Windows
en.ErrorShouldUpgrade=You should upgrade your operating system
en.Options=Options
en.CreateDesktopIcon=Create Desktop icon
en.CreateStartMenu=Create Start Menu entry
en.CreateUninstaller=Create Uninstaller
en.StartWithWindows=Start with Windows (runs app at login)
en.ButtonDonate=Donate
en.UpdateNotice=A newer version of this setup is available at
en.Finishing=Finishing ...
en.Redist=VCRuntime 2015-2019 ...
en.DirectX=DirectX Runtime ...

#include "idp.iss"

[Files]
Source: "resources\warning.bmp"; DestDir: "{tmp}" ;Flags: dontcopy;
; Electron dist — se excluyen locales no usados (~35 MB), electron.exe se renombra por rcedit
Source: "..\app\node_modules\electron\dist\*"; Excludes: "\electron.exe,\LICENSE,\version,\resources\default_app.asar,\locales"; DestDir: "{app}"; Flags: ignoreversion overwritereadonly recursesubdirs createallsubdirs;
; Locales de Electron: solo es, en-US, en-GB (idiomas soportados por la app)
Source: "..\app\node_modules\electron\dist\locales\es.pak";    DestDir: "{app}\locales"; Flags: ignoreversion overwritereadonly;
Source: "..\app\node_modules\electron\dist\locales\es-419.pak"; DestDir: "{app}\locales"; Flags: ignoreversion overwritereadonly;
Source: "..\app\node_modules\electron\dist\locales\en-US.pak"; DestDir: "{app}\locales"; Flags: ignoreversion overwritereadonly;
Source: "..\app\node_modules\electron\dist\locales\en-GB.pak"; DestDir: "{app}\locales"; Flags: ignoreversion overwritereadonly;
Source: "..\service\*"; Excludes: "\buildme.cmd,\watchdog\_wip_,\watchdog\patches,\watchdog\node_modules"; DestDir: "{app}"; Flags: ignoreversion overwritereadonly recursesubdirs createallsubdirs;
Source: "_watchdog_runtime\node_modules\*"; DestDir: "{app}\watchdog\node_modules"; Flags: ignoreversion overwritereadonly recursesubdirs createallsubdirs;
Source: "{{app}}\*"; DestDir: "{app}"; Flags: ignoreversion overwritereadonly recursesubdirs createallsubdirs;
Source: "{{appData}}\options.ini"; DestDir: "{userappdata}\Achievement Watcher\cfg"; Flags: onlyifdoesntexist;
Source: "{{appData}}\appList.json"; DestDir: "{userappdata}\Achievement Watcher\steam_cache\schema"; Flags: onlyifdoesntexist;
Source: "redist\microsoft\*"; DestDir: "{tmp}\redist" ; Flags: ignoreversion overwritereadonly recursesubdirs createallsubdirs;
Source: "redist\growl\*"; DestDir: "{tmp}\redist" ; Flags: ignoreversion overwritereadonly; 
    
[Icons]
Name: "{commondesktop}\{#AppName}"; Filename: "{#AppMain}"; WorkingDir: "{#AppWorkingDir}"; IconFilename: "{#AppIcon}"; Check: GetOption('CreateDesktopIcon');
Name: "{commonstartup}\{#AppName}"; Filename: "{#AppMain}"; Parameters: "--startup"; WorkingDir: "{#AppWorkingDir}"; IconFilename: "{#AppIcon}"; Check: GetOption('StartWithWindows');
Name: "{group}\{#AppName}"; Filename: "{#AppMain}"; WorkingDir: "{#AppWorkingDir}"; IconFilename: "{#AppIcon}"; AppUserModelID: "{#AppUserModelID}"; Check: GetOption('CreateStartMenu');
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"; WorkingDir: "{app}\__unins__"; Check: GetOption('CreateStartMenu') and GetOption('CreateUninstaller');

[Run]
;Redist
Filename: "{tmp}\redist\VC_redist.x64.exe"; Parameters: "/quiet /norestart"; WorkingDir: "{tmp}\redist"; StatusMsg: "{cm:Redist}"; Flags: runhidden waituntilterminated skipifdoesntexist skipifsilent; Check: not VCRuntimeIsInstalled
;xinput1_3 (Windows 7)
Filename: "{tmp}\redist\directx\DXSETUP.exe"; Parameters: "/silent"; WorkingDir: "{tmp}\redist\directx"; StatusMsg: "{cm:DirectX}"; Flags: runhidden waituntilterminated skipifdoesntexist skipifsilent; Check: isWin('win7')
;Misc
Filename: "{cmd}"; Parameters: "/c SCHTASKS /Create /F /TN ""Achievement Watcher Upgrade Daily"" /RL HIGHEST /SC DAILY /RI 60 /DU 24:00 /TR ""\""{app}\nw\nw.exe\"" -config updater.json"""; WorkingDir: "{app}"; StatusMsg: "{cm:Finishing}"; Flags: runhidden waituntilterminated skipifdoesntexist
Filename: "{cmd}"; Parameters: "/c Netsh.exe advfirewall firewall add rule name=""Achievement Watchdog"" program=""{app}\node\node.exe"" protocol=tcp dir=in enable=yes action=allow profile=Private"; WorkingDir: "{app}"; StatusMsg: "{cm:Finishing}"; Flags: runhidden waituntilterminated skipifdoesntexist
Filename: "{cmd}"; Parameters: "/c regsvr32 /s virtual-audio-capturer.dll"; WorkingDir: "{app}\loopback"; StatusMsg: "{cm:Finishing}"; Flags: runhidden waituntilterminated skipifdoesntexist
;PostInstall Checkbox
Filename: "{#AppMain}"; WorkingDir: "{#AppWorkingDir}"; Description: "Run {#AppName}"; Flags: runasoriginaluser postinstall nowait skipifsilent skipifdoesntexist
Filename: "msiexec.exe"; Parameters: "/i ""Growl_v2.0.msi"" "; WorkingDir: "{tmp}\redist"; Description: "Install Growl For Windows ? (Recommended for Win7)"; Flags: runasoriginaluser postinstall skipifsilent skipifdoesntexist unchecked;

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\Achievement Watcher"

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c SCHTASKS /Delete /F /TN ""Achievement Watcher Upgrade Daily"""; WorkingDir: "{app}"; StatusMsg: "{cm:Finishing}"; Flags: runhidden waituntilterminated skipifdoesntexist
Filename: "{cmd}"; Parameters: "/c regsvr32 /s /u virtual-audio-capturer.dll"; WorkingDir: "{app}\loopback"; StatusMsg: "{cm:Finishing}"; Flags: runhidden waituntilterminated skipifdoesntexist

[Registry]
Root: HKCR; Subkey: "ach"; ValueType: "string"; ValueData: "URL:Custom Protocol"; Flags: uninsdeletekey
Root: HKCR; Subkey: "ach"; ValueType: "string"; ValueName: "URL Protocol"; ValueData: "" ;Flags: uninsdeletekey
Root: HKCR; Subkey: "ach\DefaultIcon"; ValueType: "string"; ValueData: "{#AppMain},0" ;Flags: uninsdeletekey
Root: HKCR; Subkey: "ach\shell\open\command"; ValueType: "string"; ValueData: """{#AppMain}"" ""%1""" ;Flags: uninsdeletekey
;Custom Sound Schema
Root: HKCU; Subkey: "AppEvents\Schemes\Apps\.Default\Notification.Achievement"; ValueType: "string"; Flags: uninsdeletekey
Root: HKCU; Subkey: "AppEvents\Schemes\Apps\.Default\Notification.Achievement\.Current"; ValueType: "string"; ValueData: "{win}\media\Achievement Watcher - Windows 10 Notify System Generic.wav" ; Flags: uninsdeletekey createvalueifdoesntexist
Root: HKCU; Subkey: "AppEvents\Schemes\Apps\.Default\Notification.Achievement\.Default"; ValueType: "string"; ValueData: "{win}\media\Achievement Watcher - Windows 10 Notify System Generic.wav" ; Flags: uninsdeletekey createvalueifdoesntexist
;Disable Windows 8.1 quiet hours
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Explorer\QuietHours"; ValueType: "dword"; ValueName: "Enable"; ValueData: "0" ;Flags: uninsdeletekey; Check: isWin('win8.1')

[Code]

function VCRuntimeIsInstalled: Boolean;
 var
  required_major: Cardinal;
  required_minor: Cardinal;
  required_bld: Cardinal;
  required_rbld: Cardinal;
  major: Cardinal;
  minor: Cardinal;
  bld: Cardinal;
  rbld: Cardinal;
  key: String;
 begin
  required_major := 14;
  required_minor := 29;
  required_bld := 30037;
  required_rbld := 0;
  Result := False;
  key := 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64';
  if RegQueryDWordValue(HKLM, key, 'Major', major) then begin
    if RegQueryDWordValue(HKLM, key, 'Minor', minor) then begin
      if RegQueryDWordValue(HKLM, key, 'Bld', bld) then begin
        if RegQueryDWordValue(HKLM, key, 'Rbld', rbld) then begin
            Result := (major > required_major) or ((major = required_major) and ((minor > required_minor) or ((minor = required_minor) and ((bld > required_bld) or ((bld = required_bld) and (rbld >= required_rbld))))))
        end;
      end;
    end;
  end;
end;

procedure GoToWebsite(Sender: TObject);
var 
  ResultCode: Integer;
begin
    ShellExec('','{#Website}', '', '', SW_SHOW, ewNoWait, ResultCode);
end;

procedure GoToDonation(Sender: TObject);
var 
  ResultCode: Integer;
begin
    ShellExec('','{#DonationURL}', '', '', SW_SHOW, ewNoWait, ResultCode);
end;

function GetScalingFactor: String;
begin
  if WizardForm.Font.PixelsPerInch >= 192 then Result := '@x2'
    else
  if WizardForm.Font.PixelsPerInch >= 144 then Result := '@x1.50'
    else
  if WizardForm.Font.PixelsPerInch >= 120 then Result := '@x1.25'
    else Result := '';
end;

procedure CreateCopyright;
var
  Copyright, CopyrightURL: TLabel;
  BitmapFileName: String;
  Image: TBitmapImage;
begin
  BitmapFileName := ExpandConstant('{tmp}\\warning.bmp');
  ExtractTemporaryFile('warning.bmp');
  Image := TBitmapImage.Create(WizardForm);
  Image.Bitmap.LoadFromFile(BitmapFileName);
  Image.AutoSize := True;
  Image.Center := True;
  Image.Stretch := True;
  Image.Parent := WizardForm;
  Image.Left := ScaleX(8);
  Image.Width := ScaleX(45);
  Image.Height := ScaleY(45);
  Image.Top := WizardForm.NextButton.top - ScaleY(12);

  Copyright := TLabel.Create(WizardForm);
  Copyright.Top := WizardForm.NextButton.top - ScaleY(4);
  Copyright.Left := Image.Left + Image.width + ScaleX(5);
  Copyright.Caption := '{#Author} {#Copyright}';
  Copyright.AutoSize := True;
  Copyright.Parent := WizardForm;

  CopyrightURL := TLabel.Create(WizardForm);
  CopyrightURL.Top := Copyright.Top + ScaleY(15);
  CopyrightURL.Left := Copyright.Left;
  CopyrightURL.Caption := '{#Website}';
  CopyrightURL.Cursor := crHand;
  CopyrightURL.Font.Color := clBlue;
  CopyrightURL.Font.Style := [fsUnderline];
  CopyrightURL.AutoSize := True;
  CopyrightURL.Parent := WizardForm;
  CopyrightURL.OnClick:= @GoToWebsite;


end;

function IsWindowsEqualOrNewerThan( windows: string): boolean;
var
  Version : TWindowsVersion;
  major, minor : integer;
begin

  GetWindowsVersionEx(Version);

  if windows = 'xp' then begin
     major := 5;
     minor := 1;
  end else if windows = 'vista' then begin
     major := 6;
     minor := 0;
  end else if windows = 'win7' then begin
     major := 6;
     minor := 1;
  end else if windows = 'win8' then begin
     major := 6;
     minor := 2;
  end else if windows = 'win8.1' then begin
     major := 6;
     minor := 3;
  end else if windows = 'win10' then begin
     major := 10;
     minor := 0;
  end;

  Result := (Version.Major > major) or ((Version.Major = major) and (Version.Minor >= minor));

end;

function isWin (windows: string) : boolean;
var
  Version : TWindowsVersion;
  major, minor : integer;
begin

  GetWindowsVersionEx(Version);

  if windows = 'xp' then begin
     major := 5;
     minor := 1;
  end else if windows = 'vista' then begin
     major := 6;
     minor := 0;
  end else if windows = 'win7' then begin
     major := 6;
     minor := 1;
  end else if windows = 'win8' then begin
     major := 6;
     minor := 2;
  end else if windows = 'win8.1' then begin
     major := 6;
     minor := 3;
  end else if windows = 'win10' then begin
     major := 10;
     minor := 0;
  end;

  Result := (Version.Major = major) and (Version.Minor = minor);

end;

var CreateStartMenu, CreateDesktopIcon, CreateUninstaller, StartWithWindows : TNewCheckBox;

function GetOption (option: string) : boolean;
begin
    if option = 'CreateStartMenu' then begin
        Result:= CreateStartMenu.checked;
    end else if (option = 'CreateDesktopIcon') and (WizardSilent) then begin
        Result:= False;
    end else if option = 'CreateDesktopIcon' then begin
        Result:= CreateDesktopIcon.checked;
    end else if option = 'CreateUninstaller' then begin
        Result:= CreateUninstaller.checked;
    end else if option = 'StartWithWindows' then begin
        Result:= StartWithWindows.checked;
    end;
end;

procedure ModifyWizardSelectDirPage;
var
    CheckBoxTitle: TLabel;
begin

CheckBoxTitle := TLabel.Create(WizardForm);
CheckBoxTitle.Parent :=  WizardForm.SelectDirPage;
CheckBoxTitle.Top := ScaleY(100);
CheckBoxTitle.Caption := ExpandConstant(' {cm:Options}:');

CreateDesktopIcon := TNewCheckBox.Create(WizardForm);
CreateDesktopIcon.Parent := WizardForm.SelectDirPage;
CreateDesktopIcon.Top := CheckBoxTitle.Top + ScaleY(20);
CreateDesktopIcon.Left := ScaleX(20);
CreateDesktopIcon.Width := WizardForm.SelectDirPage.Width;
CreateDesktopIcon.Caption := ExpandConstant(' {cm:CreateDesktopIcon}.');
CreateDesktopIcon.Checked := True;

CreateStartMenu := TNewCheckBox.Create(WizardForm);
CreateStartMenu.Parent := WizardForm.SelectDirPage;
CreateStartMenu.Top := CreateDesktopIcon.Top + ScaleY(20);
CreateStartMenu.Left := ScaleX(20);
CreateStartMenu.Width := WizardForm.SelectDirPage.Width;
CreateStartMenu.Caption := ExpandConstant(' {cm:CreateStartMenu}.');
CreateStartMenu.Checked := True;

CreateUninstaller := TNewCheckBox.Create(WizardForm);
CreateUninstaller.Parent := WizardForm.SelectDirPage;
CreateUninstaller.Top := CreateStartMenu.Top + ScaleY(20);
CreateUninstaller.Left := ScaleX(20);
CreateUninstaller.Width := WizardForm.SelectDirPage.Width;
CreateUninstaller.Caption := ExpandConstant(' {cm:CreateUninstaller}.');
CreateUninstaller.Checked := True;

StartWithWindows := TNewCheckBox.Create(WizardForm);
StartWithWindows.Parent := WizardForm.SelectDirPage;
StartWithWindows.Top := CreateUninstaller.Top + ScaleY(20);
StartWithWindows.Left := ScaleX(20);
StartWithWindows.Width := WizardForm.SelectDirPage.Width;
StartWithWindows.Caption := ExpandConstant(' {cm:StartWithWindows}.');
StartWithWindows.Checked := False;

end;

function GetTickCount: DWORD;
  external 'GetTickCount@kernel32.dll stdcall';

var
  StartTick: DWORD;
  PercentLabel, ElapsedLabel, RemainingLabel, StatusLabel : TNewStaticText;

procedure ModifyWizardInstallingPage;
begin

  WizardForm.FilenameLabel.Visible := False;
  WizardForm.StatusLabel.top := WizardForm.FilenameLabel.Top;
  WizardForm.StatusLabel.Visible := False;
  WizardForm.ProgressGauge.width := WizardForm.ProgressGauge.width - ScaleX(40);

  StatusLabel:= TNewStaticText.Create(WizardForm);
  StatusLabel.Parent := WizardForm.FilenameLabel.Parent;
  StatusLabel.Left := WizardForm.FilenameLabel.Left;
  StatusLabel.Top := WizardForm.FilenameLabel.Top;
  StatusLabel.Width := WizardForm.FilenameLabel.Width;
  StatusLabel.Height := WizardForm.FilenameLabel.Height;
  StatusLabel.Caption := ExpandConstant('{cm:InstallingLabel,{#AppName}}');

  PercentLabel := TNewStaticText.Create(WizardForm);
  PercentLabel.Parent := WizardForm.ProgressGauge.Parent;
  PercentLabel.Left := WizardForm.ProgressGauge.width + 11;
  PercentLabel.Top := WizardForm.ProgressGauge.Top + 4;

  ElapsedLabel := TNewStaticText.Create(WizardForm);
  ElapsedLabel.Parent := WizardForm.ProgressGauge.Parent;
  ElapsedLabel.Left := 0;
  ElapsedLabel.Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + 10;

  RemainingLabel := TNewStaticText.Create(WizardForm);
  RemainingLabel.Parent := WizardForm.ProgressGauge.Parent;
  RemainingLabel.Left := ElapsedLabel.width + ScaleX(255);
  RemainingLabel.Top := ElapsedLabel.Top;

end;

function TicksToStr(Value: DWORD): string;
var
  I: DWORD;
  Hours, Minutes, Seconds: Integer;
begin
  I := Value div 1000;
  Seconds := I mod 60;
  I := I div 60;
  Minutes := I mod 60;
  I := I div 60;
  Hours := I mod 24;
  Result := Format('%.2d:%.2d:%.2d', [Hours, Minutes, Seconds]);
end;

procedure CurPageChanged(CurPageID: Integer);
var
  DonateButton: TNewButton;
begin
  WizardForm.BackButton.Enabled := False;
  WizardForm.BackButton.Visible := False;

  if CurPageID = wpInstalling then
    StartTick := GetTickCount;

  if CurPageID = wpFinished then begin
    DonateButton := TNewButton.Create(WizardForm);
    DonateButton.Parent := WizardForm;
    DonateButton.Left := WizardForm.CancelButton.Left;
    DonateButton.Top := WizardForm.CancelButton.Top;
    DonateButton.Width := WizardForm.CancelButton.Width;
    DonateButton.Height := WizardForm.CancelButton.Height;
    DonateButton.Caption := ExpandConstant('&{cm:ButtonDonate}');
    DonateButton.OnClick := @GoToDonation;
  end;
    

end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if CurPageID = wpInstalling then
  begin
    Cancel := False;
    if ExitSetupMsgBox then
    begin
      Cancel := True;
      Confirm := False;
      PercentLabel.Visible := False;
      ElapsedLabel.Visible := False;
      RemainingLabel.Visible := False;
    end;
  end;
end;

procedure CurInstallProgressChanged(CurProgress, MaxProgress: Integer);
var
  CurTick: DWORD;
begin
  CurTick := GetTickCount;
  if CurProgress = MaxProgress then 
  begin
      StatusLabel.Visible := False;
      PercentLabel.Visible := False;
      ElapsedLabel.Visible := False;
      RemainingLabel.Visible := False;
      WizardForm.StatusLabel.Visible := true;
  end else if CurProgress > 0 then
  begin
    RemainingLabel.Caption :=
      Format('Estimated left: %s', [TicksToStr(
        ((CurTick - StartTick) / CurProgress) * (MaxProgress - CurProgress))]);
  end;
    PercentLabel.Caption :=
    Format('%.0f%%', [(CurProgress * 100.0) / MaxProgress]);
    ElapsedLabel.Caption := 
    Format('Elapsed: %s', [TicksToStr(CurTick - StartTick)]);
end;

procedure modifyWelcomePage (url : string);
var
    UpdateNotice: TNewStaticText;
    UpdateURL: TLabel;
    BitmapFileName: String;
    Image: TBitmapImage;
begin
    WizardForm.WelcomeLabel2.AutoSize := True;

    BitmapFileName := ExpandConstant('{tmp}\warning.bmp');
    ExtractTemporaryFile(ExtractFileName(BitmapFileName));
    Image := TBitmapImage.Create(WizardForm);
    Image.Bitmap.LoadFromFile(BitmapFileName);
    Image.Parent := WizardForm.WelcomePage;
    Image.Left := WizardForm.WelcomeLabel2.Left;
    Image.Width := 35;
    Image.Height := 32;
    Image.Top := WizardForm.WelcomeLabel2.Top + WizardForm.WelcomeLabel2.Height + 32;
    
    UpdateNotice := TNewStaticText.Create(WizardForm);
    UpdateNotice.Parent := WizardForm.WelcomePage;
    UpdateNotice.AutoSize := False;
    UpdateNotice.Left := Image.Left + Image.width + 8;
    UpdateNotice.Top := WizardForm.WelcomeLabel2.Top + WizardForm.WelcomeLabel2.Height + 32;
    UpdateNotice.Width := WizardForm.WelcomeLabel2.Width;
    UpdateNotice.AutoSize := True;
    UpdateNotice.Font.Assign(WizardForm.WelcomeLabel2.Font);
    UpdateNotice.Caption := ExpandConstant('{cm:UpdateNotice}');
    UpdateNotice.Font.Style := [fsBold];

    UpdateURL := TLabel.Create(WizardForm);
    UpdateURL.Parent := WizardForm.WelcomePage;
    UpdateURL.Top := UpdateNotice.Top +  UpdateNotice.Height + 4;
    UpdateURL.Left := UpdateNotice.Left;
    UpdateURL.Caption := url;
    UpdateURL.Cursor := crHand;
    UpdateURL.Font.Color := clBlue;
    UpdateURL.Font.Style := [fsBold, fsUnderline];
    UpdateURL.AutoSize := True;
    UpdateURL.OnClick:= @GoToWebsite;
end;

function CompareVersion(this, that:string):integer;
var thisField, thatField:integer;
begin
 while (length(this)>0) or (length(that)>0) do begin
   if (pos('.',this)>0) then begin
     thisField:=StrToIntDef(Copy(this, 1, pos('.',this)-1),0);
     this:=Copy(this, pos('.',this)+1, length(this));
   end else begin
     thisField:=StrToIntDef(this, 0);
     this:='';
   end;

   if (pos('.',that)>0) then begin
     thatField:=StrToIntDef(Copy(that, 1, pos('.',that)-1),0);
     that:=Copy(that, pos('.',that)+1, length(that));
   end else begin
     thatField:=StrToIntDef(that, 0);
     that:='';
   end;

   if thisField>thatField then begin
    result:=1;
    exit;
   end else if thisField<thatField then begin
    result:=-1;
    exit;
   end;
 end;

 result:=0;
end;

function pingRemote(url, timeout: string): boolean;
var
  ResultCode : integer;
  ExecFileName, TmpFileName: string;
  ExecStdout: AnsiString;
  reachable: boolean;
begin

    ExecFileName := ExpandConstant('{tmp}\curl.exe');
    ExtractTemporaryFile(ExtractFileName(ExecFileName));

    TmpFileName := ExpandConstant('{tmp}') + '\ping_result.txt';
    Exec(ExpandConstant('{cmd}'), '/C '+expandconstant('{tmp}\curl.exe')+' -L -k -s -o NUL "'+url+'" --max-time '+timeout+' && echo true > "' + TmpFileName + '" || echo false > "' + TmpFileName + '"', '', SW_HIDE,ewWaitUntilTerminated, ResultCode);
    LoadStringFromFile(TmpFileName, ExecStdout);
    if Pos('true', ExecStdout) > 0 then begin
      reachable := True;
    end else begin
      reachable := False;
    end;
    DeleteFile(TmpFileName);

  Result:= reachable;

end;

procedure IsThisLastestVersion;
var
 remote_version, local_version, url: string;
begin
                                        
  local_version:='{#OurVersion}';
  idpSetOption('UserAgent',      'Chrome/');
  idpSetOption('InvalidCert',    'ignore');
  idpSetOption('ConnectTimeout', '60000');
  idpSetOption('SendTimeout', '30000');
  idpSetOption('ReceiveTimeout', '30000');
  
  if pingRemote('{#VersionURL}', '3') then begin

    if idpDownloadFile('{#VersionURL}',expandconstant('{tmp}\version.ini')) then begin    
      remote_version := GetIniString('version', 'latest', '0.0', expandconstant('{tmp}\version.ini'));
      url := GetIniString('URL', 'download', '{#Website}', expandconstant('{tmp}\version.ini'));

      if CompareVersion(trim(remote_version), trim(local_version))>0 then begin
          modifyWelcomePage(url);
      end;

   end;
 end;

end;

// -----------------------------------
//Main
function InitializeSetup(): Boolean;
begin

  if IsWindowsEqualOrNewerThan('{#MinWin}') then begin
    Result := true;
  end else begin
    MsgBox(ExpandConstant('{cm:ErrorMinWin,{#AppName}}.')+#13+ExpandConstant('{cm:ErrorShouldUpgrade}.'), mbCriticalError, MB_OK);
    Result := false;
  end;

end;

procedure InitializeWizard();
begin
    CreateCopyright;
    { Skipping remote version check to avoid requiring curl.exe at install time }
    { if not WizardSilent then begin
      IsThisLastestVersion;
    end; }
    ModifyWizardSelectDirPage;
    ModifyWizardInstallingPage;                                 
end;

procedure CurStepChanged(CurStep: TSetupStep);
var 
  ResultCode: Integer;
begin
   if(CurStep = ssInstall) then begin
   end;

   if(CurStep = ssPostInstall) then begin;
    //Old files clean up
    Exec('taskkill.exe', '/f /im watchdog.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    DelTree(ExpandConstant('{app}')+'\watchdog.exe', False, True, False);
    DelTree(ExpandConstant('{app}')+'\updater.exe', False, True, False);
   end;

   if(CurStep = ssDone) then begin;
   end;
end;

procedure InitializeUninstallProgressForm();
var 
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/f /im watchdog.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/f /im node.exe /t', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;