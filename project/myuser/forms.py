from django import forms
from django.forms import ModelForm
from django.contrib.auth import get_backends
from django.contrib.auth.forms import AuthenticationForm

from . import models


class RegisterForm(forms.ModelForm):
    # from https://docs.djangoproject.com/en/1.5/topics/auth/customizing/
    _accept_license_help_text = "License must be accepted in order to create an account."
    _password_help_text = ('Password must be at least eight characters in length, ' +
                           'at least one special character, and at least one digit.')

    accept_license = forms.BooleanField(label="Accept License",
                                        required=False,
                                        help_text=_accept_license_help_text)
    password1 = forms.CharField(label='Password',
                                widget=forms.PasswordInput,
                                help_text=_password_help_text)
    password2 = forms.CharField(label='Password confirmation',
                                widget=forms.PasswordInput)

    class Meta:
        model = models.HAWCUser
        fields = ("email", "first_name", "last_name",
                  "password1", "password2")

    def clean_accept_license(self):
        if not self.cleaned_data['accept_license']:
            raise forms.ValidationError(self._accept_license_help_text)

    def clean_password1(self):
        special_characters = r"""~!@#$%^&*()_-+=[]{};:'"\|,<.>/?"""
        password1 = self.cleaned_data['password1']
        if ((len(password1)<8) or
            (not any(char.isdigit() for char in password1)) or
            (not any(char in special_characters for char in password1))):
            raise forms.ValidationError(self._password_help_text)
        return password1

    def clean_password2(self):
        # Check that the two password entries match
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Passwords don't match")
        return password2

    def save(self, commit=True):
        # Save the provided password in hashed format
        user = super(RegisterForm, self).save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class UserProfileForm(ModelForm):

    first_name = forms.CharField(label="First name", required=True)
    last_name = forms.CharField(label="Last name", required=True)

    class Meta:
        model = models.UserProfile
        fields = ("first_name", "last_name", "HERO_access")

    def save(self, commit=True):
        # save content to both UserProfile and User
        up = super(UserProfileForm, self).save(commit=False)
        up.user.first_name = self.cleaned_data["first_name"]
        up.user.last_name = self.cleaned_data['last_name']
        if commit:
            up.save()
            up.user.save()
        return up


def hawc_authenticate(email=None, password=None):
    """
    If the given credentials are valid, return a User object.
    From: http://www.shopfiber.com/case-insensitive-username-login-in-django/
    """
    backend = get_backends()[0] # only works if one backend
    try:
      user = models.HAWCUser.objects.get(email__iexact=email)
      if user.check_password(password):
        # Annotate the user object with the path of the backend.
        user.backend = "%s.%s" % (backend.__module__,
                                  backend.__class__.__name__)
        return user
      else:
        return None
    except models.HAWCUser.DoesNotExist:
      return None


class HAWCAuthenticationForm(AuthenticationForm):
    """
    Modified to do a case-insensitive comparison of emails.
    """
    def clean(self):
        username = self.cleaned_data.get('username')
        password = self.cleaned_data.get('password')

        if username and password:
            self.user_cache = hawc_authenticate(email=username,
                                                password=password)
            if self.user_cache is None:
                raise forms.ValidationError(
                    self.error_messages['invalid_login'] % {
                        'username': self.username_field.verbose_name
                    })
            elif not self.user_cache.is_active:
                raise forms.ValidationError(self.error_messages['inactive'])
        return self.cleaned_data