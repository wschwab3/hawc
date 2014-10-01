import json

from django import forms
from django.forms import ModelForm, ValidationError, Select
from django.forms.models import BaseModelFormSet, inlineformset_factory
from django.forms.util import flatatt
from django.utils.safestring import mark_safe

from selectable.forms import AutoCompleteSelectMultipleField, AutoCompleteSelectField
from selectable.forms.widgets import AutoCompleteWidget

from assessment.models import Assessment
from assessment.lookups import EffectTagLookup
from study.models import Study
from utils.helper import HAWCDjangoJSONEncoder

from . import models
from . import lookups


DOSE_CHOICES = ((-999, '<None>'),)


class ExperimentForm(ModelForm):

    class Meta:
        model = models.Experiment
        exclude = ('study',)

    def __init__(self, *args, **kwargs):
        parent = kwargs.pop('parent', None)
        super(ExperimentForm, self).__init__(*args, **kwargs)
        self.fields['name'].widget.attrs['class'] = 'span6'
        self.fields['type'].widget.attrs['class'] = 'span6'
        self.fields['description'].widget.attrs['class'] = 'span12'
        if parent:
            self.instance.study = parent

    def clean(self):
        super(ExperimentForm, self).clean()

        # If purity available, then purity must be non-blank
        if self.cleaned_data['purity_available']:
            if self.cleaned_data.get('purity', None) is None:
                raise ValidationError("If purity data are available, value must be provided.")

        # If purity was provided, make sure purity_availalbe is True
        if self.cleaned_data.get('purity', None) is not None:
            self.cleaned_data['purity_available'] = True

        return self.cleaned_data


class AnimalGroupForm(ModelForm):

    def __init__(self, *args, **kwargs):
        experiment = kwargs.pop('parent', None)

        super(AnimalGroupForm, self).__init__(*args, **kwargs)
        self.fields['name'].widget.attrs['class'] = 'input-xxlarge'
        self.fields['dose_groups'].widget.attrs['class'] = 'input-small'

        if experiment:
            self.instance.experiment = experiment

    class Meta:
        model = models.AnimalGroup
        exclude = ('experiment', 'dosing_regime')


class GenerationalAnimalGroupForm(ModelForm):

    def __init__(self, *args, **kwargs):
        experiment = kwargs.pop('parent', None)

        super(GenerationalAnimalGroupForm, self).__init__(*args, **kwargs)

        self.fields['name'].widget.attrs['class'] = 'input-xxlarge'
        self.fields['dose_groups'].widget.attrs['class'] = 'input-small'

        if experiment:
            self.instance.experiment = experiment

    class Meta:
        model = models.GenerationalAnimalGroup
        exclude = ('experiment',)
        fields = ('name', 'species', 'strain', 'sex',
                  'generation', 'siblings', 'parents',
                  'dosing_regime', 'dose_groups')


class DosingRegimeForm(ModelForm):

    class Meta:
        model = models.DosingRegime
        exclude = ('dosed_animals',)

    def __init__(self, *args, **kwargs):
        super(DosingRegimeForm, self).__init__(*args, **kwargs)
        self.fields['route_of_exposure'].widget.attrs['class'] = 'input-large'
        self.fields['description'].widget.attrs['class'] = 'span12'


class DoseGroupForm(ModelForm):

    class Meta:
        model = models.DoseGroup
        fields = ('dose_units', 'dose_group_id', 'dose')


class EndpointForm(ModelForm):

    effects = AutoCompleteSelectMultipleField(
        lookup_class=EffectTagLookup,
        required=False,
        help_text="Any additional descriptive-tags used to categorize the outcome",
        label="Additional tags"
    )

    NOAEL = forms.CharField(label='NOAEL', widget=forms.Select(choices=DOSE_CHOICES))
    LOAEL = forms.CharField(label='LOAEL', widget=forms.Select(choices=DOSE_CHOICES))
    FEL = forms.CharField(label='FEL', widget=forms.Select(choices=DOSE_CHOICES))

    def __init__(self, *args, **kwargs):
        animal_group = kwargs.pop('parent', None)
        super(EndpointForm, self).__init__(*args, **kwargs)

        self.fields['system'].widget = AutoCompleteWidget(
            lookup_class=lookups.EndpointSystemLookup,
            allow_new=True)

        self.fields['organ'].widget = AutoCompleteWidget(
            lookup_class=lookups.EndpointOrganLookup,
            allow_new=True)

        self.fields['effect'].widget = AutoCompleteWidget(
            lookup_class=lookups.EndpointEffectLookup,
            allow_new=True)

        self.fields['statistical_test'].widget = AutoCompleteWidget(
            lookup_class=lookups.EndpointStatisticalTestLookup,
            allow_new=True)

        if animal_group:
            self.instance.animal_group = animal_group
            self.instance.assessment = animal_group.get_assessment()

        for fld in self.fields.keys():
            widget = self.fields[fld].widget
            if type(widget) != forms.CheckboxInput:
                widget.attrs['class'] = 'span12'
            else:
                widget.attrs['class'] = 'checkbox'

        for fld in ('results_notes', 'endpoint_notes'):
            self.fields[fld].widget.attrs['rows'] = 3

    class Meta:
        model = models.Endpoint
        fields = ('name', 'system', 'organ', 'effect',  'effects',
                  'data_reported', 'data_extracted', 'values_estimated',
                  'data_type', 'variance_type', 'response_units',
                  'data_location', 'NOAEL', 'LOAEL', 'FEL',
                  'monotonicity', 'statistical_test', 'trend_value',
                  'results_notes', 'endpoint_notes')


class EndpointGroupForm(ModelForm):

    class Meta:
        model = models.EndpointGroup
        fields = ('endpoint', 'dose_group_id', 'n', 'incidence',
                  'response', 'variance', 'significance_level')
        exclude = ('significant',)


class UploadFileForm(forms.Form):
    file = forms.FileField()


class IndividualAnimalForm(ModelForm):

    class Meta:
        model = models.IndividualAnimal


class UncertaintyFactorEndpointForm(ModelForm):
    """
    Custom form for UF to ensure that the endpoint is not changed when a user
    edits the form.
    """
    def __init__(self, *args, **kwargs):
        endpoint = kwargs.pop('parent', None)
        super(UncertaintyFactorEndpointForm, self).__init__(*args, **kwargs)
        if endpoint:
            self.instance.endpoint = endpoint

    class Meta:
        model = models.UncertaintyFactorEndpoint
        exclude = ('endpoint', )


class AJAXUncertaintyFactorEndpointForm(ModelForm):
    """
    No manipulation of endpoint with form.
    """
    class Meta:
        model = models.UncertaintyFactorEndpoint


class HiddenSelectBox(Select):
    """
    Special-case for a select-box where the selector should be hidden and a
    text-version of the selected field should be displayed.
    """
    def render(self, name, value, attrs=None, choices=()):
        if value is None: value = ''
        pretty_choice = ''
        for k, v in self.choices:
            if k == value:
                pretty_choice = v

        final_attrs = self.build_attrs(attrs, name=name)
        final_attrs['style'] = ' '.join([final_attrs.get('style', ''), 'display:none;'])
        output = [u'<b>' + unicode(pretty_choice) + '</b><select%s>' % flatatt(final_attrs)]
        options = self.render_options(choices, [value])
        if options:
            output.append(options)
        output.append(u'</select>')
        return mark_safe(u'\n'.join(output))


class UncertaintyFactorRefValForm(ModelForm):
    """
    Custom form for UF to ensure that the endpoint is not changed when a user
    edits the form.
    """

    def __init__(self, *args, **kwargs):
        reference_value_pk = kwargs.pop('reference_value_pk', None)
        super(UncertaintyFactorRefValForm, self).__init__(*args, **kwargs)
        self.fields['value'].widget.attrs['class'] = 'span12 uf_values'
        self.fields['uf_type'].widget = HiddenSelectBox(choices=models.UF_TYPE_CHOICES)
        self.fields['uf_type'].widget.attrs['class'] = 'span12'
        self.fields['description'].widget.attrs['class'] = 'span12 uf_descriptions'
        if reference_value_pk:
            self.instance.reference_value = models.ReferenceValue.objects.get(pk=reference_value_pk)

    class Meta:
        model = models.UncertaintyFactorRefVal
        exclude = ('reference_value', )


class AggregationForm(ModelForm):

    def __init__(self, *args, **kwargs):
        assessment = kwargs.pop('parent', None)
        super(AggregationForm, self).__init__(*args, **kwargs)

        if assessment:
            self.instance.assessment = assessment

        # customize how endpoints are viewed in aggregation form
        self.fields['endpoints'].queryset = models.Endpoint.objects.filter(
                animal_group__in=models.AnimalGroup.objects.filter(
                    experiment__in=models.Experiment.objects.filter(
                        study__in=Study.objects.filter(assessment=self.instance.assessment)))
            ).select_related('animal_group',
                             'animal_group__experiment',
                             'animal_group__experiment__study')
        choices = []
        for endpoint in self.fields['endpoints'].queryset:
            choices.append((endpoint.pk,
                            endpoint.get_m2m_representation()))
        self.fields['endpoints'].widget.choices = choices

    class Meta:
        model = models.Aggregation
        exclude = ('assessment',)


class AggregationSearchForm(forms.Form):
    name = forms.CharField(required=True)

    def __init__(self, *args, **kwargs):
        assessment_pk = kwargs.pop('assessment_pk', None)
        super(AggregationSearchForm, self).__init__(*args, **kwargs)
        if assessment_pk:
            self.assessment = Assessment.objects.get(pk=assessment_pk)

    def search(self):
        query = {}
        if self.cleaned_data['name']:
            query['name__icontains'] = self.cleaned_data['name']

        response_json = []
        for obj in models.Aggregation.objects.filter(assessment=self.assessment).filter(**query):
            response_json.append(obj.get_json(json_encode=False))
        return response_json


class ReferenceValueForm(ModelForm):
    def __init__(self, *args, **kwargs):
        assessment = kwargs.pop('parent', None)
        super(ReferenceValueForm, self).__init__(*args, **kwargs)
        if assessment:
            self.instance.assessment = assessment

        self.fields['aggregation'].queryset = models.Aggregation.objects.filter(assessment=self.instance.assessment)

    class Meta:
        model = models.ReferenceValue
        exclude = ('assessment', 'aggregate_uf', 'reference_value')


class Base_UFRefVal_FormSet(BaseModelFormSet):
    def clean(self):
        """Checks that all uncertainty-factor types are unique."""
        if any(self.errors):
            return
        ufs = []
        for form in self.forms:
            uf = form.cleaned_data['uf_type']
            if uf in ufs:
                raise ValidationError("Uncertainty-factors must be unique for a given reference-value.")
            ufs.append(uf)


UFRefValFormSet = inlineformset_factory(models.ReferenceValue,
                                        models.UncertaintyFactorRefVal,
                                        form=UncertaintyFactorRefValForm,
                                        formset=Base_UFRefVal_FormSet,
                                        extra=0, can_delete=False)


class SpeciesForm(ModelForm):

    class Meta:
        model = models.Species

    def __init__(self, *args, **kwargs):
        kwargs.pop('parent', None)
        super(SpeciesForm, self).__init__(*args, **kwargs)

    def clean_name(self):
        return self.cleaned_data['name'].title()


class StrainForm(ModelForm):

    class Meta:
        model = models.Strain

    def __init__(self, *args, **kwargs):
        kwargs.pop('parent', None)
        super(StrainForm, self).__init__(*args, **kwargs)

    def clean_name(self):
        return self.cleaned_data['name'].title()


class EndpointSearchForm(forms.Form):

    endpoint_name = forms.CharField(required=False)

    tags = AutoCompleteSelectField(
        lookup_class=EffectTagLookup,
        label='Endpoint effect tag',
        required=False,
    )

    def clean(self):
        cleaned_data = super(EndpointSearchForm, self).clean()
        if ((cleaned_data['endpoint_name'] == u"") and
                (cleaned_data['tags'] == None)):
            raise forms.ValidationError("At least one search criteria should be specified.")
        return cleaned_data

    def get_search_results_div(self):
        return """
        <div>
        <b>Query details:</b><br>
        <ul>
            <li><b>Endpoint name: </b>{n}</li>
            <li><b>Tags: </b>{t}</li>
        </ul>
        </div>
        """.format(n=self.cleaned_data['endpoint_name'],
                   t=self.cleaned_data['tags'])

    def search(self, assessment):
        response = {'status': 'ok', 'endpoints': []}
        try:
            # build query
            query = {"assessment": assessment}
            if self.cleaned_data['endpoint_name'] is not "":
                query['name__icontains'] = self.cleaned_data['endpoint_name']
            if self.cleaned_data['tags'] is not None:
               query['effects__name'] = self.cleaned_data['tags']

            # filter endpoints
            endpoints = models.Endpoint.objects.filter(**query).distinct()

            # build response
            for endpoint in endpoints:
                response['endpoints'].append(endpoint.d_response(json_encode=False))
        except:
            response['status'] = 'An error occurred.'
        return json.dumps(response, cls=HAWCDjangoJSONEncoder)


class DoseUnitsForm(ModelForm):

    class Meta:
        model = models.DoseUnits
        fields = ("units", )

    def __init__(self, *args, **kwargs):
        kwargs.pop('parent', None)
        super(DoseUnitsForm, self).__init__(*args, **kwargs)
        self.fields['units'].widget = AutoCompleteWidget(
            lookup_class=lookups.DoseUnitsLookup,
            allow_new=True)
        for fld in self.fields.keys():
            self.fields[fld].widget.attrs['class'] = 'span12'