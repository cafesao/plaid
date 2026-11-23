import {LoginModalComponent} from './login-modal.component';

describe('LoginModalComponent', () => {
  let component: LoginModalComponent;

  beforeEach(() => {
    component = new LoginModalComponent();
    component.authInfo = {jiraUrl: '', username: '', password: ''};
  });

  describe('onUrlChange', () => {
    it('should add https:// if no protocol is present', () => {
      component.authInfo.jiraUrl = 'jira.example.com';
      component.onUrlChange();
      expect(component.authInfo.jiraUrl).toBe('https://jira.example.com');
    });

    it('should not modify URL with https://', () => {
      component.authInfo.jiraUrl = 'https://jira.example.com';
      component.onUrlChange();
      expect(component.authInfo.jiraUrl).toBe('https://jira.example.com');
    });

    it('should not modify URL with http://', () => {
      component.authInfo.jiraUrl = 'http://jira.example.com';
      component.onUrlChange();
      expect(component.authInfo.jiraUrl).toBe('http://jira.example.com');
    });

    it('should remove trailing slash', () => {
      component.authInfo.jiraUrl = 'https://jira.example.com/';
      component.onUrlChange();
      expect(component.authInfo.jiraUrl).toBe('https://jira.example.com');
    });

    it('should show http notice for http:// URLs', () => {
      component.authInfo.jiraUrl = 'http://jira.example.com';
      component.onUrlChange();
      expect(component.httpNoticeVisible).toBe(true);
    });

    it('should not show http notice for https:// URLs', () => {
      component.authInfo.jiraUrl = 'https://jira.example.com';
      component.onUrlChange();
      expect(component.httpNoticeVisible).toBe(false);
    });

    it('should handle empty URL', () => {
      component.authInfo.jiraUrl = '';
      component.onUrlChange();
      expect(component.authInfo.jiraUrl).toBe('');
    });
  });
});
