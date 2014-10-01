from django.core.mail import mail_admins
from django import forms

from selectable.forms import AutoCompleteSelectMultipleField, AutoCompleteWidget

from myuser.lookups import HAWCUserLookup

from . import models
from . import lookups


class AssessmentForm(forms.ModelForm):

    project_manager = AutoCompleteSelectMultipleField(
        lookup_class=HAWCUserLookup,
        label='Project Manager(s)',
        help_text='Have full assessment control, including the ability to add team members, make public, or delete an assessment',
        required=True,
    )

    team_members = AutoCompleteSelectMultipleField(
        lookup_class=HAWCUserLookup,
        label='Team Member(s)',
        help_text='Can view and edit assessment components, when the project is editable',
        required=False,
    )

    reviewers = AutoCompleteSelectMultipleField(
        lookup_class=HAWCUserLookup,
        label='Reviewers(s)',
        help_text='Can view assessment components in read-only mode; can also add comments.',
        required=False,
    )
    class Meta:
        exclude = ('enable_literature_review',
                   'enable_data_extraction',
                   'enable_study_quality',
                   'enable_bmd',
                   'enable_reference_values',
                   'enable_summary_text',
                   'enable_comments')
        model = models.Assessment


class AssessmentModulesForm(forms.ModelForm):

    class Meta:
        fields = ('enable_literature_review',
                  'enable_data_extraction',
                  'enable_study_quality',
                  'enable_bmd',
                  'enable_reference_values',
                  'enable_summary_text',
                  'enable_comments')
        model = models.Assessment


class EffectTagForm(forms.ModelForm):

    class Meta:
        model = models.EffectTag

    def __init__(self, *args, **kwargs):
        kwargs.pop('parent')
        super(EffectTagForm, self).__init__(*args, **kwargs)
        self.fields['name'].widget = AutoCompleteWidget(
            lookup_class=lookups.EffectTagLookup,
            allow_new=True)
        for fld in self.fields.keys():
            self.fields[fld].widget.attrs['class'] = 'span12'


class ContactForm(forms.Form):
    sender = forms.EmailField(label="Your email")
    subject = forms.CharField(max_length=100)
    message = forms.CharField(widget=forms.Textarea)

    def send_email(self):
        mail_admins(u'[Contact Us]: ' + self.cleaned_data['subject'],
                    self.cleaned_data['message'] + u'\n\n ' + self.cleaned_data['sender'],
                    fail_silently=False)

    def __init__(self, *args, **kwargs):
        super(ContactForm, self).__init__(*args, **kwargs)
        for key in self.fields.keys():
            self.fields[key].widget.attrs['class'] = 'span12'